# PicoShare CLI

Node.js command-line client for the PicoShare SaaS API. It uploads and searches files, returns public share links, and manages cloud notes.

## Requirements and setup

- Node.js 20 or newer
- `PICOSHARE_BASE_URL` set to the PicoShare service URL
- `PICOSHARE_API_KEY` set in the process environment or injected by a secret manager

Install the CLI from the repository root:

```sh
sh .agents/cli/install.sh
picoshare --help
```

The default installer registers the command globally, so use `picoshare ...` from any directory. To install dependencies without registering a global command, run `sh .agents/cli/install.sh --local`; then use `./.agents/cli/bin/picoshare ...` from the repository root. The API Key is read only from `PICOSHARE_API_KEY`; the CLI does not accept it as a command-line argument or write it to a config file.

The installer also copies the PicoShare Skill, including its API reference, into the common Agent skill directories. Build the downloadable CLI + Skill archives and standalone AI prompts with:

```sh
cd .agents/cli
npm run package:agent-kit
```

The ZIP and tar.gz archives are written to `public/downloads/` and include an installer, the CLI, the Skill, and prompt examples.

## Commands

```text
picoshare files upload <path> [--note <text>] [--expires <days>]
picoshare files list [--search <text>] [--limit <number>]
picoshare files get <id>
picoshare files share <id>
picoshare files download <id> [--output <path>] [--overwrite]
picoshare files delete <id> --yes

picoshare notes list [--search <text>] [--limit <number>]
picoshare notes get <slug>
picoshare notes put <slug> (--content <text> | --file <path> | --stdin) [--replace]
picoshare notes share <slug>
picoshare notes public <public-id> [--password-env <name>]
picoshare notes password <slug> [--remove] [--password-env <name>]
```

Run `picoshare --help` for the command tree and add `--help` to a command for its options.

## Examples

```sh
picoshare files upload ./report.pdf --note "October report" --expires 30
picoshare files list --search report
picoshare files download FILE_ID --output ./report.pdf
picoshare notes list
picoshare notes get meeting-notes
picoshare notes put meeting-notes --file ./meeting-notes.md
picoshare notes put meeting-notes --file ./meeting-notes.md --replace
picoshare notes share meeting-notes
```

Files at or above 100 MiB automatically use the API's 8 MiB multipart upload flow. File search is local because `GET /api/entries` returns the full account list without server-side search or pagination.

For a new cloud note, use `notes put`. If the slug already has different content, the CLI stops unless `--replace` is supplied. File deletion requires `--yes`; downloads do not overwrite an existing destination unless `--overwrite` is supplied.

The CLI prints human-readable output in an interactive terminal and JSON envelopes when stdout is piped. Pass `--json` to force JSON. File and note share URLs are public to anyone who has the link; share them only with the intended recipients.
