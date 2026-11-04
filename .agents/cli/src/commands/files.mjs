import { PicoShareError } from "../api-client.mjs";

function parsePositiveInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    throw new PicoShareError(`${label} must be a positive integer.`, { code: "INVALID_ARGUMENT" });
  }
  return number;
}

export function registerFileCommands(program, action) {
  const files = program.command("files").description("Upload, search, share, download, and delete files");

  files.command("upload <path>")
    .description("Upload a local file and return its share link")
    .option("--note <text>", "Private file note")
    .option("--expires <days>", "Expire the file after this many days")
    .option("--content-type <mime>", "Override the detected content type")
    .action(action("files.upload", async ({ client, args, options }) => {
      const path = args[0];
      const expirationDays = options.expires == null ? undefined : parsePositiveInteger(options.expires, "--expires");
      if (expirationDays != null && expirationDays > 3650) {
        throw new PicoShareError("--expires cannot exceed 3650 days.", { code: "INVALID_ARGUMENT" });
      }
      const result = await client.uploadFile(path, {
        note: options.note,
        expirationDays,
        contentType: options.contentType,
      });
      return {
        result,
        nextActions: [
          `picoshare files get ${result.id}`,
          `picoshare files download ${result.id} --output <path>`,
        ],
      };
    }));

  files.command("list")
    .description("List files; optionally filter by filename or note")
    .option("--search <text>", "Case-insensitive search in filename and note")
    .option("--limit <number>", "Limit displayed results")
    .action(action("files.list", async ({ client, options }) => {
      let items = await client.listFiles();
      if (!Array.isArray(items)) throw new PicoShareError("Unexpected file list response from PicoShare.", { code: "INVALID_RESPONSE" });
      if (options.search) {
        const search = options.search.toLowerCase();
        items = items.filter((item) => `${item.filename || ""} ${item.note || ""}`.toLowerCase().includes(search));
      }
      if (options.limit != null) items = items.slice(0, parsePositiveInteger(options.limit, "--limit"));
      return { result: items, nextActions: items[0] ? [`picoshare files get ${items[0].id}`] : [] };
    }));

  files.command("get <id>")
    .description("Show file metadata and its public share URL")
    .action(action("files.get", async ({ client, args }) => {
      const entry = await client.getFile(args[0]);
      return {
        result: { ...entry, shareUrl: client.fileShareUrl(entry.id) },
        nextActions: [`picoshare files download ${entry.id} --output <path>`],
      };
    }));

  files.command("share <id>")
    .description("Print the public share URL for a file ID")
    .action(action("files.share", async ({ client, args }) => ({
      result: { id: args[0], shareUrl: client.fileShareUrl(args[0]) },
      nextActions: [],
    })));

  files.command("download <id>")
    .description("Download a shared file to disk")
    .option("--output <path>", "Destination path (defaults to the original filename)")
    .option("--overwrite", "Replace an existing destination file")
    .action(action("files.download", async ({ client, args, options }) => ({
      result: await client.downloadFile(args[0], { output: options.output, overwrite: options.overwrite }),
      nextActions: [],
    })));

  files.command("delete <id>")
    .description("Permanently delete a file")
    .requiredOption("--yes", "Confirm permanent deletion")
    .action(action("files.delete", async ({ client, args }) => {
      const result = await client.deleteFile(args[0]);
      return { result: { id: args[0], ...result }, nextActions: [] };
    }));
}
