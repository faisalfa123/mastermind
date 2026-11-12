//! Auto-discovery of installable apps: owner repos that ship `<id>.batasan.toml` + an arm64 release asset.
use crate::batasan::Batasan;
use crate::config::Config;
use serde::Serialize;
use serde_json::Value;
use std::time::Duration;

#[derive(Debug, Serialize, Clone)]
pub struct Entry {
    pub id: String,
    pub repo: String,
    pub version: String,
    pub description: String,
    pub priority: u8,
    pub port: u16,
    pub memory_max_mb: u32,
    pub cpu_quota_pct: u8,
    pub language: String,
    pub asset_url: String,
    pub checksum_url: Option<String>,
    pub batasan_toml: String,
    #[serde(skip)]
    pub batasan: Option<Batasan>,
}

#[derive(Debug, Serialize, Clone)]
pub struct Unconfigured {
    pub repo: String,
    pub reason: String,
}

fn get(cfg: &Config, url: &str) -> Result<Value, String> {
    let mut r = ureq::get(url).set("User-Agent", "mastermind").set("Accept", "application/vnd.github+json").timeout(Duration::from_secs(20));
    if let Some(t) = &cfg.github_token { r = r.set("Authorization", &format!("Bearer {t}")); }
    r.call().map_err(|e| format!("{url}: {e}"))?.into_json().map_err(|e| e.to_string())
}

fn get_text(url: &str) -> Result<String, String> {
    ureq::get(url).set("User-Agent", "mastermind").timeout(Duration::from_secs(20)).call().map_err(|e| e.to_string())?.into_string().map_err(|e| e.to_string())
}

/// Pure function (unit-tested): turn a repo's batasan text + latest-release JSON into a catalog entry.
pub fn build_entry(repo: &str, toml: &str, release: &Value) -> Result<Entry, String> {
    let b = Batasan::parse(toml).map_err(|e| format!("invalid batasan: {e}"))?;
    if !b.app.repo.eq_ignore_ascii_case(repo) {
        return Err(format!("batasan repo '{}' does not match {repo}", b.app.repo));
    }
    let prefix = format!("https://github.com/{repo}/releases/download/");
    let assets = release["assets"].as_array().ok_or("release has no assets")?;
    let find = |name: &str| assets.iter().find(|a| a["name"].as_str() == Some(name)).and_then(|a| a["browser_download_url"].as_str())
        .filter(|u| u.to_lowercase().starts_with(&prefix.to_lowercase())).map(String::from);
    let asset_url = find(&b.app.asset).ok_or_else(|| format!("release has no asset {}", b.app.asset))?;
    let checksum_url = find("checksums.txt").or_else(|| find("SHA256SUMS")).or_else(|| find(&format!("{}.sha256", b.app.asset)));
    Ok(Entry {
        id: b.app.id.clone(), repo: repo.into(), version: release["tag_name"].as_str().unwrap_or("?").into(),
        description: b.app.description.clone().unwrap_or_default(), priority: b.run.priority, port: b.run.port,
        memory_max_mb: b.limits.memory_max_mb, cpu_quota_pct: b.limits.cpu_quota_pct, language: b.app.language.clone(),
        asset_url, checksum_url, batasan_toml: toml.into(), batasan: Some(b),
    })
}

/// Finds the expected sha256 for `asset` in a checksums file ("<hex>  <name>" lines or a bare hash).
pub fn parse_checksum(text: &str, asset: &str) -> Option<String> {
    for l in text.lines() {
        let mut it = l.split_whitespace();
        let (h, n) = (it.next()?, it.next());
        let valid = h.len() == 64 && h.bytes().all(|c| c.is_ascii_hexdigit());
        if valid && n.map(|n| n.trim_start_matches('*').trim_start_matches("./") == asset).unwrap_or(true) { return Some(h.to_lowercase()); }
    }
    None
}

pub fn fetch_text(url: &str) -> Result<String, String> { get_text(url) }

/// Normalizes user input (e.g. "https://github.com/owner/repo" or "owner/repo") to "owner/repo" safely.
pub fn parse_repo(input: &str) -> Result<String, String> {
    let s = input.trim().trim_end_matches('/');
    let s = s.strip_prefix("https://github.com/").or_else(|| s.strip_prefix("http://github.com/")).unwrap_or(s);
    let parts: Vec<&str> = s.split('/').collect();
    if parts.len() != 2 || parts[0].is_empty() || parts[1].is_empty() {
        return Err("format harus owner/repo atau https://github.com/owner/repo".into());
    }
    let owner = parts[0];
    let repo = parts[1];
    let valid_char = |c: char| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.';
    if !owner.chars().all(valid_char) || !repo.chars().all(valid_char) {
        return Err("karakter nama repo tidak valid".into());
    }
    Ok(format!("{owner}/{repo}"))
}

/// Inspect a single repository for .batasan.toml and arm64 release asset
pub fn inspect_repo(cfg: &Config, repo: &str) -> Result<Entry, String> {
    let list = get(cfg, &format!("https://api.github.com/repos/{repo}/contents/"))?;
    let file = list.as_array().and_then(|a| a.iter().find(|f| f["name"].as_str().map(|n| n.ends_with(".batasan.toml")).unwrap_or(false)))
        .ok_or_else(|| format!("{repo}: tidak ditemukan file *.batasan.toml di root repo"))?;
    let url = file["download_url"].as_str().ok_or("tidak ada download_url untuk *.batasan.toml")?;
    let t = get_text(url)?;
    let rel = get(cfg, &format!("https://api.github.com/repos/{repo}/releases/latest"))
        .map_err(|e| format!("{repo}: belum ada rilis terbaru (GitHub release): {e}"))?;
    build_entry(repo, &t, &rel)
}

pub fn discover(cfg: &Config) -> (Vec<Entry>, Vec<Unconfigured>) {
    let (mut ok, mut bad) = (Vec::new(), Vec::new());
    let mut repos: Vec<String> = Vec::new();
    match get(cfg, &format!("https://api.github.com/users/{}/repos?per_page=100&type=owner", cfg.github_owner)) {
        Ok(Value::Array(a)) => repos.extend(a.iter().filter(|r| !r["fork"].as_bool().unwrap_or(false) && !r["archived"].as_bool().unwrap_or(false)).filter_map(|r| r["full_name"].as_str().map(String::from))),
        Ok(_) => {}
        Err(e) => bad.push(Unconfigured { repo: cfg.github_owner.clone(), reason: format!("discovery failed: {e}") }),
    }
    repos.extend(cfg.extra_repos.iter().cloned());
    repos.dedup();
    for repo in repos {
        match inspect_repo(cfg, &repo) {
            Ok(e) => ok.push(e),
            Err(e) => bad.push(Unconfigured { repo, reason: e }),
        }
    }
    (ok, bad)
}

#[cfg(test)]
mod tests {
    use super::*;
    const T: &str = "[app]\nid=\"senandung\"\nrepo=\"faisalfa123/Senandung\"\nasset=\"senandung-linux-arm64\"\nlanguage=\"go\"\n[run]\nport=8080\npriority=50\n";
    fn rel(url: &str) -> Value {
        serde_json::json!({"tag_name":"v1.2.0","assets":[
            {"name":"senandung-linux-arm64","browser_download_url":url},
            {"name":"checksums.txt","browser_download_url":"https://github.com/faisalfa123/Senandung/releases/download/v1.2.0/checksums.txt"}]})
    }
    #[test]
    fn builds() {
        let e = build_entry("faisalfa123/Senandung", T, &rel("https://github.com/faisalfa123/Senandung/releases/download/v1.2.0/senandung-linux-arm64")).unwrap();
        assert_eq!(e.version, "v1.2.0");
        assert!(e.checksum_url.is_some());
    }
    #[test]
    fn rejects_foreign_download_host() {
        assert!(build_entry("faisalfa123/Senandung", T, &rel("https://evil.example/senandung-linux-arm64")).is_err());
    }
    #[test]
    fn rejects_repo_mismatch() {
        assert!(build_entry("someone/else", T, &rel("https://github.com/someone/else/releases/download/v1/x")).is_err());
    }
    #[test]
    fn checksum_parse() {
        let h = "a".repeat(64);
        assert_eq!(parse_checksum(&format!("{h}  senandung-linux-arm64\n"), "senandung-linux-arm64"), Some(h.clone()));
        assert_eq!(parse_checksum(&format!("{h}  other\n"), "senandung-linux-arm64"), None);
        assert_eq!(parse_checksum(&h, "x"), Some(h));
    }
    #[test]
    fn parse_repo_cases() {
        assert_eq!(parse_repo("faisalfa123/Senandung").unwrap(), "faisalfa123/Senandung");
        assert_eq!(parse_repo("https://github.com/faisalfa123/DompetMungil/").unwrap(), "faisalfa123/DompetMungil");
        assert_eq!(parse_repo("http://github.com/faisalfa123/kompic").unwrap(), "faisalfa123/kompic");
        assert!(parse_repo("https://evil.com/a/b").is_err());
        assert!(parse_repo("singleword").is_err());
        assert!(parse_repo("owner/repo/extra").is_err());
        assert!(parse_repo("owner/repo;rm -rf /").is_err());
    }
}
