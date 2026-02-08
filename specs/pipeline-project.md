End goal: a semi-automated pipeline that: 

Receives a list of new words that should be created in the app in some cadence (every day, most likely) 

Using Gemini API, generates image candidates for each word to be reviewed by a moderator (for all levels) 

Using Claude/ChatGPT API, generates word definitions for each word to be reviewed by a moderator (for all levels)

Publishes those candidates to a private, password controlled page of the already published kidwords site that admins can access (currently just me). 

Each word should have the option of selecting the best definition and best image among those listed. 

If image/word/neither is good, present a text box for admin to include a sub-prompt for just that word to get it to generate a better version in the next round. 

Generate a better candidate either immediately, or in the next round (i.e. in the next cadence) 

Once best definition and image are selected for each word, update the Kidwords github app with that information and re-deploy through Vercel. 

