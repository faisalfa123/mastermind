//! Reads a repo's legacy install route (installer script, README, systemd unit)
//! and drafts a jail-ready `.batasan.toml` plus a release workflow. No compiling.
use crate::batasan::{Batasan, TOOLS};

#[derive(Debug, Default, PartialEq, serde::Serialize)]
pub struct Findings {
    pub port: Option<u16>,
    pub tools: Vec<String>,
    pub exec_args: Vec<String>,
    pub language: String,
    pub entry: Option<String>,
    pub folder_paths: Vec<String>,
}

const CANDIDATES: [&str; 14] = [
    "install.sh", "install-tui.sh", "install-wizard.sh", "README.md",
    "deploy/install.sh", "systemd/app.service", "package.json",
    "requirements.txt", "app.py", "go.mod", "main.go", "Cargo.toml",
    "batasan.toml", "index.html",
];

/// Scan text blobs for port, whitelisted tools, webapp runtime, folder requests, and ExecStart args.
pub fn analyze(texts: &[String]) -> Findings {
    let mut f = Findings { language: "go".into(), ..Default::default() };
    let has_go = texts.iter().any(|t| t.contains("module ") || t.contains("package main") || t.contains("go build") || t.contains("type = \"go\""));
    let has_rust = texts.iter().any(|t| t.contains("[package]") && t.contains("edition ="));
    let has_node = texts.iter().any(|t| t.contains("\"dependencies\"") || (t.contains("\"scripts\"") && t.contains("node")));
    let has_python = texts.iter().any(|t| t.contains("flask") || t.contains("fastapi") || t.contains("uvicorn") || t.contains("http.server"));

    if has_go {
        f.language = "go".into();
    } else if has_rust {
        f.language = "rust".into();
    } else if has_node {
        f.language = "node".into();
        if f.entry.is_none() { f.entry = Some("index.js".into()); }
    } else if has_python {
        f.language = "python".into();
        if f.entry.is_none() { f.entry = Some("app.py".into()); }
    } else if texts.iter().any(|t| t.contains("<!doctype html") || t.contains("<!DOCTYPE html") || t.contains("<html")) {
        f.language = "static".into();
        if f.entry.is_none() { f.entry = Some("index.html".into()); }
    }

    for t in texts {

        for line in t.lines() {
            let l = line.trim();
            if f.port.is_none() {
                if let Some(i) = l.find("PORT=").or_else(|| l.find("--port")).or_else(|| l.find("port:")) {
                    let digits: String = l[i..].chars().skip_while(|c| !c.is_ascii_digit()).take_while(char::is_ascii_digit).collect();
                    if let Ok(p) = digits.parse::<u16>() { if p >= 1024 { f.port = Some(p); } }
                }
            }
            if let Some(rest) = l.strip_prefix("ExecStart=") {
                for a in rest.split_whitespace().skip(1) {
                    if !a.starts_with("--port") && f.exec_args.len() < 8 { f.exec_args.push(a.to_string()); }
                }
            }
            for root in ["/mnt/", "/media/", "/srv/"] {
                if let Some(idx) = l.find(root) {
                    let path: String = l[idx..].chars().take_while(|c| c.is_ascii_alphanumeric() || "/._-".contains(*c)).collect();
                    if path.len() > root.len() && !f.folder_paths.contains(&path) && f.folder_paths.len() < 6 {
                        f.folder_paths.push(path);
                    }
                }
            }
        }
        for tool in TOOLS {
            if t.contains(tool) && !f.tools.iter().any(|x| x == tool) && !["git", "curl", "python3", "node", "npm"].contains(&tool) {
                f.tools.push(tool.to_string());
            }
        }
    }
    f
}

/// Draft a validated `.batasan.toml`; port/mem/folders are user-adjustable in the confirmation screen.
pub fn draft(repo: &str, f: &Findings, port: u16, mem_mb: u32, asset: &str) -> Result<String, String> {
    let name = repo.split('/').nth(1).ok_or("repo must be owner/name")?;
    let id: String = name.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    let lang = if f.language.is_empty() { "go" } else { f.language.as_str() };
    let tools = f.tools.iter().map(|t| format!("\"{t}\"")).collect::<Vec<_>>().join(", ");
    let entry_line = f.entry.as_ref().map(|e| format!("entry = \"{e}\"\n")).unwrap_or_default();
    let mut paths_rw = vec![format!("\"/var/lib/mastermind/{id}\"")];
    for p in &f.folder_paths {
        paths_rw.push(format!("\"{p}\""));
    }
    let toml = format!(
        "[app]\nid = \"{id}\"\nrepo = \"{repo}\"\nasset = \"{asset}\"\nlanguage = \"{lang}\"\n\n[run]\nport = {port}\n{entry_line}priority = 50\n\n[limits]\nmemory_max_mb = {mem_mb}\ncpu_quota_pct = 50\ntasks_max = 64\n\n[permissions]\npaths_rw = [{}]\ntools = [{tools}]\nsandbox_tools = true\n",
        paths_rw.join(", ")
    );
    Batasan::parse(&toml).map_err(|e| e.to_string())?;
    Ok(toml)
}

pub fn workflow(id: &str) -> String {
    format!("name: release\non:\n  push:\n    tags: ['v*']\njobs:\n  build:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: write\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo \"build your arm64 binary as {id}-linux-arm64 here\"\n      - run: sha256sum {id}-linux-arm64 > checksums.txt\n      - uses: softprops/action-gh-release@v2\n        with:\n          files: |\n            {id}-linux-arm64\n            checksums.txt\n")
}

/// Fetch candidate legacy/webapp files from the repo's default branch.
pub fn fetch_legacy(repo: &str) -> Vec<String> {
    CANDIDATES.iter().filter_map(|c| crate::discover::fetch_text(&format!("https://raw.githubusercontent.com/{repo}/HEAD/{c}")).ok()).collect()
}

fn ask(q: &str, default: &str) -> String {
    use std::io::Write;
    print!("{q} [{default}]: ");
    let _ = std::io::stdout().flush();
    let mut s = String::new();
    let _ = std::io::stdin().read_line(&mut s);
    let s = s.trim();
    if s.is_empty() { default.into() } else { s.into() }
}

/// `mastermind adopt <owner/repo>`: detect, confirm interactively, write drafts.
pub fn run(args: &[String]) -> Result<(), String> {
    let repo = crate::discover::parse_repo(args.first().ok_or("usage: mastermind adopt <owner/repo>")?)?;
    let f = analyze(&fetch_legacy(&repo));
    println!("Terdeteksi: port={:?} tools={:?}", f.port, f.tools);
    let port: u16 = ask("Port", &f.port.unwrap_or(8080).to_string()).parse().map_err(|_| "port tidak valid")?;
    let mem: u32 = ask("Batas RAM (MB)", "96").parse().map_err(|_| "RAM tidak valid")?;
    let toml = draft(&repo, &f, port, mem, &format!("{}-linux-arm64", repo.split('/').nth(1).unwrap_or("app").to_lowercase()))?;
    let id = repo.split('/').nth(1).unwrap_or("app").to_lowercase();
    std::fs::write(format!("{id}.batasan.toml"), &toml).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(".github-draft").ok();
    std::fs::write(format!(".github-draft/release-{id}.yml"), workflow(&id)).map_err(|e| e.to_string())?;
    println!("Ditulis: {id}.batasan.toml dan .github-draft/release-{id}.yml (dry-run, tidak ada yang diubah di repo)");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn detects_port_tools_args() {
        let f = analyze(&["Environment=PORT=9100\nExecStart=/opt/x/x --data /var/x\nuses yt-dlp".to_string()]);
        assert_eq!(f.port, Some(9100));
        assert_eq!(f.tools, vec!["yt-dlp"]);
        assert_eq!(f.exec_args[0], "--data");
    }
    #[test]
    fn draft_validates_and_jails() {
        let t = draft("faisalfa123/Senandung", &Findings { tools: vec!["ffmpeg".into()], ..Default::default() }, 8080, 96, "senandung-linux-arm64").unwrap();
        assert!(t.contains("paths_rw = [\"/var/lib/mastermind/senandung\"]"));
        assert!(t.contains("\"ffmpeg\""));
    }
}
