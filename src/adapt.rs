//! Reads a repo's legacy install route (installer script, README, systemd unit)
//! and drafts a jail-ready `.batasan.toml` plus a release workflow. No compiling.
use crate::batasan::{Batasan, TOOLS};

#[derive(Debug, Default, PartialEq)]
pub struct Findings {
    pub port: Option<u16>,
    pub tools: Vec<String>,
    pub exec_args: Vec<String>,
}

const CANDIDATES: [&str; 6] = ["install.sh", "install-tui.sh", "install-wizard.sh", "README.md", "deploy/install.sh", "systemd/app.service"];

/// Scan text blobs for port, whitelisted tools and ExecStart args.
pub fn analyze(texts: &[String]) -> Findings {
    let mut f = Findings::default();
    for t in texts {
        for line in t.lines() {
            let l = line.trim();
            if f.port.is_none() {
                if let Some(i) = l.find("PORT=").or_else(|| l.find("--port")) {
                    let digits: String = l[i..].chars().skip_while(|c| !c.is_ascii_digit()).take_while(char::is_ascii_digit).collect();
                    if let Ok(p) = digits.parse::<u16>() { if p >= 1024 { f.port = Some(p); } }
                }
            }
            if let Some(rest) = l.strip_prefix("ExecStart=") {
                for a in rest.split_whitespace().skip(1) {
                    if !a.starts_with("--port") && f.exec_args.len() < 8 { f.exec_args.push(a.to_string()); }
                }
            }
        }
        for tool in TOOLS {
            if t.contains(tool) && !f.tools.iter().any(|x| x == tool) && !["git", "curl", "python3"].contains(&tool) {
                f.tools.push(tool.to_string());
            }
        }
    }
    f
}

/// Draft a validated `.batasan.toml`; port/mem are user-adjustable in the confirmation screen.
pub fn draft(repo: &str, f: &Findings, port: u16, mem_mb: u32) -> Result<String, String> {
    let name = repo.split('/').nth(1).ok_or("repo must be owner/name")?;
    let id: String = name.to_lowercase().chars().map(|c| if c.is_ascii_alphanumeric() { c } else { '-' }).collect();
    let tools = f.tools.iter().map(|t| format!("\"{t}\"")).collect::<Vec<_>>().join(", ");
    let toml = format!(
        "[app]\nid = \"{id}\"\nrepo = \"{repo}\"\nasset = \"{id}-linux-arm64\"\nlanguage = \"go\"\n\n[run]\nport = {port}\npriority = 50\n\n[limits]\nmemory_max_mb = {mem_mb}\ncpu_quota_pct = 50\ntasks_max = 64\n\n[permissions]\npaths_rw = [\"/var/lib/mastermind/{id}\"]\ntools = [{tools}]\n"
    );
    Batasan::parse(&toml).map_err(|e| e.to_string())?;
    Ok(toml)
}

pub fn workflow(id: &str) -> String {
    format!("name: release\non:\n  push:\n    tags: ['v*']\njobs:\n  build:\n    runs-on: ubuntu-latest\n    permissions:\n      contents: write\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo \"build your arm64 binary as {id}-linux-arm64 here\"\n      - run: sha256sum {id}-linux-arm64 > checksums.txt\n      - uses: softprops/action-gh-release@v2\n        with:\n          files: |\n            {id}-linux-arm64\n            checksums.txt\n")
}

/// Fetch candidate legacy files from the repo's default branch.
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
    let toml = draft(&repo, &f, port, mem)?;
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
        let t = draft("faisalfa123/Senandung", &Findings { tools: vec!["ffmpeg".into()], ..Default::default() }, 8080, 96).unwrap();
        assert!(t.contains("paths_rw = [\"/var/lib/mastermind/senandung\"]"));
        assert!(t.contains("\"ffmpeg\""));
    }
}
