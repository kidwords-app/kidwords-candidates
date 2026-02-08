This is the directory where new words are uploaded in a JSON format, which probably looks like: 

{
   "words":[
      {
         "word":"illusion",
         "levels":[
            "preschooler",
            "kindergartener",
            "first grader"
         ],
         "partOfSpeech":"noun",
         "syllables":3,
         "tags":"thinking"
      }
   ]
}

A file upload here will trigger a workflow that generates definitions using various kinds of models and drops them in the candidates directory. 
