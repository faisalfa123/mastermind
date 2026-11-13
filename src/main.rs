mod adapt;
mod admin;
mod audit;
mod auth;
mod batasan;
mod config;
mod discover;
mod helper;
mod installer;
mod ipc;
mod localscan;
mod notify;
mod scanner;
mod setup;
mod store;
mod systemd;
mod web;

fn main() {
    let args: Vec<String> = std::env::args().skip(1).collect();
    let res = match args.first().map(String::as_str) {
        Some("serve") => config::Config::load().and_then(web::serve),
        Some("helper") => config::Config::load().and_then(|c| helper::serve(&c)),
        Some("admin") => admin::run(&args[1..]),
        Some("adopt") => adapt::run(&args[1..]),
        Some("setup") => setup::run(),
        Some("validate") => validate(args.get(1)),
        Some("notify-test") => config::Config::load().map(|c| {
            let e = notify::send_blocking(&c, "Test", "Mastermind notification test");
            if e.is_empty() { println!("sent"); } else { for x in e { eprintln!("{x}"); } }
        }),
        _ => { println!("mastermind {}\nusage: mastermind <setup|serve|helper|admin|adopt <owner/repo>|validate <file>|notify-test>", env!("CARGO_PKG_VERSION")); Ok(()) }
    };
    if let Err(e) = res { eprintln!("error: {e}"); std::process::exit(1); }
}

fn validate(path: Option<&String>) -> Result<(), String> {
    let path = path.ok_or("usage: mastermind validate <id>.batasan.toml")?;
    let s = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let b = batasan::Batasan::parse(&s).map_err(|e| e.to_string())?;
    println!("OK: {} (priority {}, {} MB, {}% CPU)", b.app.id, b.run.priority, b.limits.memory_max_mb, b.limits.cpu_quota_pct);
    Ok(())
}
