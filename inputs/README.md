This is the directory where new words are uploaded in a JSON format. Put batch files under `word-batches/` named `YYYY-MM-DD.json`. Shape (see `specs/pipeline-02-word-ingest.md`):

```json
{
   "roundId": "2026-02-01",
   "words": [
      {
         "word": "illusion",
         "levels": ["preschooler", "kindergartener", "first grader"],
         "partOfSpeech": "noun",
         "syllables": 3,
         "tags": ["thinking"]
      }
   ]
}
```

`levels` is required; each value must be one of: `"preschooler"`, `"kindergartener"`, `"first grader"`.

A file upload here will trigger a workflow that generates definitions using various kinds of models and drops them in the candidates directory. 
