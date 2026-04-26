# Scripts

## Cartoon generation

Generate a cartoon image for a word using Gemini.

```
npm run cartoon:gen -- --word "rocket" --output "generated_image.png"
# Optional: --level kindergartener   (text for one level only) or --levels preschooler,kindergartener
```

Notes:
- `--level` is currently treated as a string placeholder for future definition.
- The output path is optional; it defaults to `generated_image.png`.

