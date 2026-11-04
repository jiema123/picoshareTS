import { PicoShareError } from "./api-client.mjs";

export function isJsonMode(options) {
  return Boolean(options.json || !process.stdout.isTTY);
}

function humanSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  return `${(value / 1024 ** 3).toFixed(1)} GiB`;
}

function printList(items, kind) {
  if (!items.length) {
    console.log(kind === "files" ? "No files found." : "No cloud notes found.");
    return;
  }

  if (kind === "files") {
    console.log(`${items.length} file(s)`);
    for (const item of items) {
      const details = [humanSize(item.size), `downloads ${item.download_count ?? 0}`];
      if (item.expiration_time) details.push(`expires ${item.expiration_time}`);
      console.log(`- ${item.filename}  [${item.id}]  ${details.join(" · ")}`);
      if (item.note) console.log(`  note: ${item.note}`);
    }
    return;
  }

  console.log(`${items.length} cloud note(s)`);
  for (const item of items) {
    console.log(`- ${item.slug}  updated ${item.updatedAt || "unknown"}${item.hasPassword ? "  [password]" : ""}`);
  }
}

function printHuman(command, result) {
  if (command.endsWith(".list") && Array.isArray(result)) {
    printList(result, command.startsWith("files.") ? "files" : "notes");
    return;
  }
  if (result && typeof result === "object" && result.shareUrl) {
    if (command === "files.upload") console.log(`Uploaded ${result.filename}.`);
    else if (command === "notes.put") console.log(`Saved cloud note '${result.slug}'.`);
    console.log(`Share URL: ${result.shareUrl}`);
    const rest = { ...result };
    delete rest.shareUrl;
    if (Object.keys(rest).length) console.log(JSON.stringify(rest, null, 2));
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

export function printSuccess(command, result, nextActions, jsonMode) {
  if (jsonMode) {
    console.log(JSON.stringify({ ok: true, command, result, next_actions: nextActions }, null, 2));
  } else {
    printHuman(command, result);
  }
}

export function printFailure(command, error, jsonMode) {
  const normalized = error instanceof Error ? error : new Error(String(error));
  const output = {
    message: normalized.message,
    code: normalized.code || "CLI_ERROR",
    ...(normalized.status ? { status: normalized.status } : {}),
    ...(normalized.details !== undefined ? { details: normalized.details } : {}),
  };
  const fix = normalized.fix || (normalized instanceof PicoShareError ? undefined : "Run 'picoshare --help' for command usage.");

  if (jsonMode) {
    console.log(JSON.stringify({ ok: false, command, error: output, ...(fix ? { fix } : {}), next_actions: [] }, null, 2));
    return;
  }

  console.error(`Error: ${normalized.message}`);
  if (fix) console.error(`Fix: ${fix}`);
}
