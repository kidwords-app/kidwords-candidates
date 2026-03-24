import type { WordCandidate } from '@/lib/types';

/** Mirrors the sample data in mockups/mockup-c-sidebar-dashboard.html. */
export const MOCK_WORDS: WordCandidate[] = [
  {
    wordId:       'empathy',
    word:         'empathy',
    partOfSpeech: 'noun',
    syllables:    3,
    tags:         ['emotions', 'social skills', 'SEL'],
    roundId:      '2026-03-03',
    status:       'in_review',
    images: [
      {
        imageId:   'img_xk72ms',
        prompt:    'Two children sharing an umbrella in the rain, one comforting the other, soft watercolor style',
        model:     'gemini',
        assetPath: 'candidates/rounds/2026-03-03/assets/empathy/img_xk72ms.png',
        createdAt: '2026-03-03T09:14:00Z',
      },
      {
        imageId:   'img_p9n3qa',
        prompt:    "A young girl placing her hand on a crying friend's shoulder in a sunny classroom, illustration style",
        model:     'gemini',
        assetPath: 'candidates/rounds/2026-03-03/assets/empathy/img_p9n3qa.png',
        createdAt: '2026-03-03T09:17:00Z',
      },
      {
        imageId:   'img_m4hv7z',
        prompt:    'Cartoon bear hugging a smaller bear who is crying, pastel colors, simple shapes for children',
        model:     'gemini',
        assetPath: 'candidates/rounds/2026-03-03/assets/empathy/img_m4hv7z.png',
        createdAt: '2026-03-03T09:22:00Z',
      },
    ],
    levels: {
      preK: [
        {
          model:      'chatgpt',
          definition: "Empathy means you can feel what someone else feels — if they're sad, you feel a little sad too.",
          example:    'Maya saw her friend crying and felt sad too, because she had empathy.',
          tryIt:      "Show empathy by giving someone a hug when they're upset!",
        },
        {
          model:      'claude',
          definition: 'Empathy is when you notice how another person is feeling and care about it.',
          example:    'He showed empathy when he shared his cookie with his friend who was hungry.',
          tryIt:      "Ask a friend 'How are you feeling today?' — that's empathy in action!",
        },
        {
          model:      'chatgpt',
          definition: 'Empathy means caring about how other people feel, even if you feel differently.',
          example:    'Tina had empathy when she saw her baby brother fall and ran over to help.',
          tryIt:      "Next time a friend is sad, try saying 'I'm here for you' and mean it.",
        },
      ],
      K: [
        {
          model:      'chatgpt',
          definition: 'Empathy is the ability to understand and share the feelings of another person.',
          example:    'Sofia showed empathy by sitting with her friend who felt left out at recess.',
          tryIt:      'Think about a time you felt left out — now imagine how others might feel that way too.',
        },
        {
          model:      'claude',
          definition: "Empathy means putting yourself in someone else's shoes to understand their feelings.",
          example:    'Liam used empathy when he helped his sister find her teddy bear because he knew it made her feel safe.',
          tryIt:      'Draw a face that shows how a friend might feel when something goes wrong.',
        },
      ],
      G1: [
        {
          model:      'chatgpt',
          definition: "Empathy is recognizing and sharing in another person's emotional experience, even if you haven't had the same experience yourself.",
          example:    'Even though Marcus had never broken his arm, he felt empathy for his friend and stayed to help.',
          tryIt:      'Write two sentences about how a character in a story might be feeling and why.',
        },
        {
          model:      'claude',
          definition: 'Empathy is the capacity to sense and understand the feelings of others as if they were your own.',
          example:    'Priya showed empathy when she noticed her teammate was nervous before the presentation and encouraged her.',
          tryIt:      'List three things you could do or say to show empathy to someone having a bad day.',
        },
        {
          model:      'chatgpt',
          definition: "Empathy means truly understanding how someone else feels — not just knowing it, but feeling connected to their experience.",
          example:    'Jordan had deep empathy for the new student who ate lunch alone, so he asked if he could join him.',
          tryIt:      'Interview a family member about a challenge they faced. Practice listening with empathy.',
        },
      ],
    },
    selected:   {},
    subPrompts: {},
    createdAt:  '2026-03-03T00:00:00Z',
    updatedAt:  '2026-03-03T00:00:00Z',
  },
  {
    wordId: 'resilience', word: 'resilience', partOfSpeech: 'noun', syllables: 4,
    tags: ['character', 'growth mindset'], roundId: '2026-03-03', status: 'pending',
    images: [
      { imageId: 'img_res_01', prompt: 'Child getting back up after falling off a bike, determined expression', model: 'gemini', assetPath: 'candidates/rounds/2026-03-03/assets/resilience/img_res_01.png', createdAt: '2026-03-03T10:00:00Z' },
      { imageId: 'img_res_02', prompt: 'A small plant growing through a crack in pavement, bright sunshine', model: 'gemini', assetPath: 'candidates/rounds/2026-03-03/assets/resilience/img_res_02.png', createdAt: '2026-03-03T10:05:00Z' },
    ],
    levels: {
      preK: [
        { model: 'chatgpt', definition: 'Resilience means you keep trying even when things are hard.', example: 'When her block tower fell, she built it again — that is resilience!', tryIt: 'Try something tricky today and keep going even if it feels hard.' },
        { model: 'claude',  definition: "Resilience is bouncing back when something doesn't go your way.", example: 'He fell off his bike but got right back on — he showed resilience.', tryIt: 'Think of something you found hard but kept trying. Share it with a friend!' },
      ],
      K: [
        { model: 'chatgpt', definition: 'Resilience is the ability to recover quickly after something disappointing happens.', example: 'Even though she missed the goal, she kept playing with a smile.', tryIt: 'Draw a picture of a time you bounced back from something tough.' },
        { model: 'claude',  definition: "Resilience means not giving up when challenges come your way.", example: 'After failing the spelling quiz, he studied harder and passed the next one.', tryIt: 'Name one thing you can do to help yourself feel better when things go wrong.' },
      ],
      G1: [
        { model: 'chatgpt', definition: 'Resilience is the strength to recover from difficulties and keep moving forward despite setbacks.', example: 'Despite losing the science fair, Maya used the feedback to improve her project for next year.', tryIt: 'Write about a time you faced a setback. What helped you get through it?' },
      ],
    },
    selected: {}, subPrompts: {}, createdAt: '2026-03-03T00:00:00Z', updatedAt: '2026-03-03T00:00:00Z',
  },
  {
    wordId: 'curiosity', word: 'curiosity', partOfSpeech: 'noun', syllables: 5,
    tags: ['learning', 'exploration'], roundId: '2026-03-03', status: 'approved',
    images: [
      { imageId: 'img_cur_01', prompt: 'Wide-eyed child looking through a magnifying glass at a butterfly', model: 'gemini', assetPath: 'candidates/rounds/2026-03-03/assets/curiosity/img_cur_01.png', createdAt: '2026-03-02T11:00:00Z' },
    ],
    levels: {
      preK: [
        { model: 'chatgpt', definition: "Curiosity is wanting to find out about things you don't know yet.", example: 'She had curiosity when she looked under every rock to find bugs.', tryIt: 'Ask someone a question about something you want to know today.' },
        { model: 'claude',  definition: "Curiosity means you love asking 'why?' and learning new things.", example: 'His curiosity made him ask his teacher why the sky is blue.', tryIt: 'Pick one thing outside and ask as many questions about it as you can!' },
      ],
      K: [
        { model: 'chatgpt', definition: 'Curiosity is a strong desire to learn and explore the world around you.', example: "Her curiosity led her to the library every week to read about different animals.", tryIt: 'Make a list of five questions you wonder about. Then try to find the answers!' },
        { model: 'claude',  definition: 'Curiosity is being eager to discover new things and understand how they work.', example: 'His curiosity about plants made him start a small garden in his bedroom.', tryIt: 'Visit a new place in your neighborhood and notice three things you have never seen before.' },
        { model: 'chatgpt', definition: 'Curiosity means always wanting to know more and never being satisfied with "I don\'t know."', example: 'She showed curiosity by asking her grandpa to teach her how to bake bread from scratch.', tryIt: 'Write down something you are curious about and spend five minutes learning about it.' },
      ],
      G1: [
        { model: 'chatgpt', definition: 'Curiosity is an intrinsic motivation to explore, question, and seek understanding of the world beyond what is already known.', example: "Alex's curiosity about the stars led him to borrow every astronomy book from the library.", tryIt: 'Design an experiment to answer one question you are curious about.' },
        { model: 'claude',  definition: 'Curiosity is the impulse to investigate and the willingness to sit with open questions until you find meaningful answers.', example: 'Her curiosity about why people speak different languages started a year-long language-learning journey.', tryIt: 'Interview someone whose job you find interesting. Write three questions beforehand.' },
      ],
    },
    selected: { imageId: 'img_cur_01', levels: { preK: { definition: 0, example: 0, tryIt: 0 }, K: { definition: 1, example: 1, tryIt: 0 }, G1: { definition: 0, example: 0, tryIt: 0 } } },
    subPrompts: {}, createdAt: '2026-03-02T00:00:00Z', updatedAt: '2026-03-02T00:00:00Z',
  },
  {
    wordId: 'persevere', word: 'persevere', partOfSpeech: 'verb', syllables: 4,
    tags: ['character', 'growth mindset'], roundId: '2026-03-01', status: 'needs_regen',
    images: [
      { imageId: 'img_per_01', prompt: 'Child at a desk late at night studying with determination', model: 'gemini', assetPath: 'candidates/rounds/2026-03-01/assets/persevere/img_per_01.png', createdAt: '2026-03-01T08:00:00Z' },
    ],
    levels: {
      preK: [
        { model: 'chatgpt', definition: 'Persevere means to keep going even when something is really hard.', example: 'She persevered when she kept practicing her handwriting every day.', tryIt: 'Try tying your shoes five times in a row without giving up.' },
      ],
      K: [
        { model: 'chatgpt', definition: 'To persevere means to keep working toward your goal no matter how many times you struggle.', example: 'He persevered through the whole math worksheet even though it was challenging.', tryIt: 'Pick a skill you want to learn and practice it a little every day for a week.' },
        { model: 'claude',  definition: 'Persevere means to continue steadily in doing something despite difficulty.', example: 'She persevered through months of swim lessons and finally learned the butterfly stroke.', tryIt: 'Think of something you gave up on. What could you do to try again?' },
      ],
      G1: [
        { model: 'chatgpt', definition: 'To persevere is to continue pursuing a goal with determination even in the face of obstacles, failure, or discouragement.', example: 'Despite failing the audition twice, he persevered and earned a role in the school play.', tryIt: 'Write about a goal you have. List three obstacles and how you plan to overcome each one.' },
        { model: 'claude',  definition: 'Perseverance is the quality of continuing to work toward something meaningful even when progress feels slow or difficult.', example: "Her perseverance through years of violin practice meant she performed at the city's concert hall.", tryIt: 'Track your progress on a hard goal for two weeks. What helps you keep going?' },
      ],
    },
    selected: {},
    subPrompts: { image: 'more colorful, child should look hopeful not tired' },
    createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z',
  },
  {
    wordId: 'gratitude', word: 'gratitude', partOfSpeech: 'noun', syllables: 4,
    tags: ['emotions', 'mindfulness'], roundId: '2026-03-03', status: 'in_review',
    images: [
      { imageId: 'img_gra_01', prompt: 'Child writing in a thank-you card at a kitchen table, warm lighting', model: 'gemini', assetPath: 'candidates/rounds/2026-03-03/assets/gratitude/img_gra_01.png', createdAt: '2026-03-03T12:00:00Z' },
      { imageId: 'img_gra_02', prompt: 'Family around a dinner table, everyone smiling and holding hands', model: 'gemini', assetPath: 'candidates/rounds/2026-03-03/assets/gratitude/img_gra_02.png', createdAt: '2026-03-03T12:06:00Z' },
    ],
    levels: {
      preK: [
        { model: 'chatgpt', definition: "Gratitude means feeling happy about the good things you have and the people who help you.", example: 'She showed gratitude by saying thank you and giving her grandma a big hug.', tryIt: 'Tell someone one thing you are grateful for today.' },
        { model: 'claude',  definition: 'Gratitude is the warm feeling you get when you appreciate something kind that someone did for you.', example: "He felt gratitude when his friend shared a snack because he'd forgotten his lunch.", tryIt: 'Draw a picture of something you are grateful for and share it.' },
      ],
      K: [
        { model: 'chatgpt', definition: 'Gratitude is the feeling of being thankful and appreciating the good things in your life.', example: 'She wrote a thank-you note to her teacher to show her gratitude for all the help.', tryIt: 'Start a gratitude jar — write one thing you are thankful for on a paper each day this week.' },
        { model: 'claude',  definition: 'Gratitude means recognizing and being thankful for the good things people do and the blessings you have.', example: "His gratitude showed when he helped clean up after his neighbor's party as a thank-you.", tryIt: 'Write three things you are grateful for today and explain why each one matters.' },
      ],
      G1: [
        { model: 'chatgpt', definition: 'Gratitude is a deep appreciation for what you have received, accompanied by the desire to give thanks and acknowledge kindness.', example: "Her gratitude for her coach's patience led her to write a heartfelt letter at the end of the season.", tryIt: 'Write a letter of gratitude to someone who has made a difference in your life.' },
        { model: 'claude',  definition: 'Gratitude is the conscious recognition of the value of what others contribute to your life and wellbeing.', example: 'He expressed gratitude by volunteering at the food bank to give back to his community.', tryIt: 'Keep a gratitude journal for one week. What patterns do you notice in what you appreciate?' },
      ],
    },
    selected: {}, subPrompts: {}, createdAt: '2026-03-03T00:00:00Z', updatedAt: '2026-03-03T00:00:00Z',
  },
  {
    wordId: 'inspire', word: 'inspire', partOfSpeech: 'verb', syllables: 3,
    tags: ['character', 'creativity'], roundId: '2026-03-01', status: 'pending',
    images: [
      { imageId: 'img_ins_01', prompt: 'Child standing on a stage giving a speech to classmates, confident and smiling', model: 'gemini', assetPath: 'candidates/rounds/2026-03-01/assets/inspire/img_ins_01.png', createdAt: '2026-03-01T13:00:00Z' },
      { imageId: 'img_ins_02', prompt: 'Artist child showing younger kids how to paint a rainbow, bright studio', model: 'gemini', assetPath: 'candidates/rounds/2026-03-01/assets/inspire/img_ins_02.png', createdAt: '2026-03-01T13:08:00Z' },
    ],
    levels: {
      preK: [
        { model: 'chatgpt', definition: 'To inspire means to make someone feel excited and ready to try something new.', example: 'Watching the dancer inspired her to start taking dance lessons.', tryIt: 'Tell a friend about something you love — you might inspire them to try it too!' },
        { model: 'claude',  definition: 'Inspire means to fill someone with the wish to do something great.', example: "His painting inspired everyone in class to make their own colorful artwork.", tryIt: 'Show someone something you made. You may inspire them to create something too!' },
      ],
      K: [
        { model: 'chatgpt', definition: 'To inspire someone means to fill them with motivation or the desire to do or create something.', example: "Her teacher's stories about scientists inspired her to start her own nature journal.", tryIt: 'Think of someone who inspires you. Write two sentences about why they inspire you.' },
        { model: 'claude',  definition: 'Inspire means to spark in someone the enthusiasm and confidence to pursue a dream or idea.', example: 'Reading about Harriet Tubman inspired him to learn more about courage and justice.', tryIt: 'Share a story or book that inspired you with a classmate.' },
      ],
      G1: [
        { model: 'chatgpt', definition: 'To inspire is to positively influence others by igniting their imagination, courage, or desire to act through your own example or ideas.', example: 'Her dedication to the environment inspired her school to start a recycling program.', tryIt: 'Write about a person — real or fictional — who inspires you and explain the impact they have had.' },
        { model: 'claude',  definition: 'To inspire means to fill others with a sense of possibility and the motivation to pursue meaningful goals.', example: "His speech about his grandmother's immigrant journey inspired the whole class to share their own family stories.", tryIt: 'Think of a way you can inspire someone younger than you. Make a plan and carry it out.' },
      ],
    },
    selected: {}, subPrompts: {}, createdAt: '2026-03-01T00:00:00Z', updatedAt: '2026-03-01T00:00:00Z',
  },
];
