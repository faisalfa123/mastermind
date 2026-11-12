mod batasan;

fn main() {
    let args: Vec<String> = std::env::args().collect();
    match args.get(1).map(String::as_str) {
        Some("validate") => {
            let Some(path) = args.get(2) else {
                eprintln!("usage: mastermind validate <id>.batasan.toml");
                std::process::exit(2);
            };
            match std::fs::read_to_string(path)
                .map_err(|e| e.to_string())
                .and_then(|s| batasan::Batasan::parse(&s).map_err(|e| e.to_string()))
            {
                Ok(b) => println!("OK: {} (priority {})", b.app.id, b.run.priority),
                Err(e) => {
                    eprintln!("INVALID: {e}");
                    std::process::exit(1);
                }
            }
        }
        _ => println!("mastermind {} - usage: mastermind validate <file>", env!("CARGO_PKG_VERSION")),
    }
}
