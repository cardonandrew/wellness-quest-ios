/* ============================================================================
 * Wellness Quest — native actions port
 * ----------------------------------------------------------------------------
 * Standalone port of the Wellness Quest server actions
 * (ts-spaces/wellness-quest/server/src/actions.ts) that runs against
 * on-device SQLite via the @capacitor-community/sqlite Capacitor plugin.
 *
 * No zod, no drizzle, no server. All persistence is local SQLite.
 * Exposes: window.WellnessQuestNative = { init(), callAction(name, args) }
 * ========================================================================== */

const DB_NAME = 'wellnessquest.db';

/* ============================== constants ============================== */

const CATEGORY_IDS = ['mindset', 'journaling', 'nutrition', 'fitness', 'hydration', 'education'];

const CATEGORY_META = {
  mindset: { name: 'Mindset', icon: '🧠', description: 'Quiet the noise. Choose your focus.' },
  journaling: { name: 'Journaling', icon: '📝', description: 'Turn the day into insight.' },
  nutrition: { name: 'Nutrition', icon: '🥗', description: 'Fuel the mission with intention.' },
  fitness: { name: 'Fitness', icon: '💪', description: 'Build strength through action.' },
  hydration: { name: 'Hydration', icon: '💧', description: 'Keep your energy moving.' },
  education: { name: 'Education', icon: '📚', description: 'Learn one thing worth keeping.' },
};

const DEFAULT_TASKS = [
  { id: 'mindset-meditation', categoryId: 'mindset', chillTitle: 'Meditate for 5 minutes', balancedTitle: 'Meditate for 10 minutes', beastTitle: 'Meditate for 20 minutes', sortOrder: 1 },
  { id: 'mindset-prayer', categoryId: 'mindset', chillTitle: 'Pause for a short prayer', balancedTitle: 'Morning prayer', beastTitle: 'Morning prayer + gratitude', sortOrder: 2 },
  { id: 'journaling-prompt', categoryId: 'journaling', chillTitle: 'Write 2 honest lines', balancedTitle: "Complete today's journal prompt", beastTitle: 'Journal + name one lesson', sortOrder: 1 },
  { id: 'journaling-gratitude', categoryId: 'journaling', chillTitle: 'Name one good thing', balancedTitle: 'List 3 gratitudes', beastTitle: 'Write a deep gratitude reflection', sortOrder: 2 },
  { id: 'nutrition-protein', categoryId: 'nutrition', chillTitle: 'Eat one protein-forward meal', balancedTitle: 'Hit your protein goal', beastTitle: 'Hit protein + prep tomorrow', sortOrder: 1 },
  { id: 'nutrition-calories', categoryId: 'nutrition', chillTitle: 'Log one meal', balancedTitle: 'Stay within your calorie target', beastTitle: 'Plan and hit your calorie target', sortOrder: 2 },
  { id: 'fitness-workout', categoryId: 'fitness', chillTitle: 'Move for 10 minutes', balancedTitle: 'Complete a 30-minute workout', beastTitle: 'Complete a 45-minute workout', sortOrder: 1 },
  { id: 'fitness-steps', categoryId: 'fitness', chillTitle: 'Walk 5,000 steps', balancedTitle: 'Walk 8,000 steps', beastTitle: 'Walk 10,000 steps', sortOrder: 2 },
  { id: 'hydration-glasses', categoryId: 'hydration', chillTitle: 'Drink 4 glasses of water', balancedTitle: 'Drink 6 glasses of water', beastTitle: 'Drink 8 glasses of water', sortOrder: 1 },
  { id: 'hydration-morning', categoryId: 'hydration', chillTitle: 'Drink water after waking', balancedTitle: 'Drink 2 glasses before noon', beastTitle: 'Morning water + carry a refill', sortOrder: 2 },
  { id: 'education-reading', categoryId: 'education', chillTitle: 'Read 10 pages', balancedTitle: 'Read 20 pages', beastTitle: 'Read 30 pages', sortOrder: 1 },
  { id: 'education-learning', categoryId: 'education', chillTitle: 'Learn for 10 minutes', balancedTitle: 'Learn something new', beastTitle: 'Practice a skill for 30 minutes', sortOrder: 2 },
];

const XP_BY_INTENSITY = { chill: 10, balanced: 25, beast: 50 };

const QUEST_CHAINS = [
  { id: 'warrior', title: 'Warrior Week', description: 'Train your body and steady your mind every day.', categories: ['fitness', 'mindset'], badge: 'Warrior', bonusXp: 200 },
  { id: 'clear-current', title: 'Clear Current', description: 'Pair hydration with a daily reflection.', categories: ['hydration', 'journaling'], badge: 'Clear Current', bonusXp: 175 },
  { id: 'fuel-focus', title: 'Fuel & Focus', description: 'Nourish your body and learn something each day.', categories: ['nutrition', 'education'], badge: 'Focused Fuel', bonusXp: 200 },
  { id: 'whole-self', title: 'Whole Self', description: 'Build physical momentum and capture what it teaches you.', categories: ['fitness', 'journaling'], badge: 'Whole Self', bonusXp: 225 },
  { id: 'sharp-start', title: 'Sharp Start', description: 'Start clear: mindset and learning, seven days running.', categories: ['mindset', 'education'], badge: 'Sharp Start', bonusXp: 200 },
  { id: 'steady-energy', title: 'Steady Energy', description: 'Support your energy with water and intentional fuel.', categories: ['hydration', 'nutrition'], badge: 'Steady Energy', bonusXp: 175 },
];

const STREAK_MILESTONES = [1, 2, 3, 7, 14, 30, 60, 100];

/* 365 daily journal prompts, embedded at build time (date: "MM-DD"). */
const JOURNAL_PROMPTS_DATA = {"prompts":[{"date":"01-01","prompt":"What is one word you want to define this year, and why does it matter to you right now?"},{"date":"01-02","prompt":"Describe the version of yourself you're walking toward this year. What does a Tuesday look like for them?"},{"date":"01-03","prompt":"What is something you tolerated last year that you refuse to tolerate this year?"},{"date":"01-04","prompt":"Write about a small habit that quietly changed your life for the better."},{"date":"01-05","prompt":"If you could send a letter to yourself last January, what would it say?"},{"date":"01-06","prompt":"What does starting fresh actually feel like to you — exciting, scary, or something else?"},{"date":"01-07","prompt":"Name three things you're carrying into this year that you want to set down."},{"date":"01-08","prompt":"Describe your ideal morning routine. What's stopping you from starting it tomorrow?"},{"date":"01-09","prompt":"What is a fear you've outgrown? How do you know?"},{"date":"01-10","prompt":"Write about someone who believed in you before you believed in yourself."},{"date":"01-11","prompt":"If money were no object, how would you spend next Tuesday?"},{"date":"01-12","prompt":"What is one thing you know now that you wish you'd known five years ago?"},{"date":"01-13","prompt":"Describe a moment when you felt completely at peace. What made it possible?"},{"date":"01-14","prompt":"What would you attempt if you knew you couldn't fail?"},{"date":"01-15","prompt":"Write about a book, song, or movie that changed how you see the world."},{"date":"01-16","prompt":"What is the best compliment you've ever received? Why did it stick?"},{"date":"01-17","prompt":"Describe the kind of friend you try to be. Are you succeeding?"},{"date":"01-18","prompt":"What is something you've been avoiding? What's the smallest first step?"},{"date":"01-19","prompt":"If your life had a theme song right now, what would it be and why?"},{"date":"01-20","prompt":"Write about a time you surprised yourself."},{"date":"01-21","prompt":"What does success look like to you — not to your parents, not to social media, to you?"},{"date":"01-22","prompt":"Describe a place where you feel most like yourself."},{"date":"01-23","prompt":"What is one thing you'd do differently if nobody would ever know?"},{"date":"01-24","prompt":"Write a thank-you note to someone who will never read it."},{"date":"01-25","prompt":"What is the hardest lesson life has taught you so far?"},{"date":"01-26","prompt":"If you had an extra hour every day, how would you spend it?"},{"date":"01-27","prompt":"Describe your relationship with your phone. Is it serving you?"},{"date":"01-28","prompt":"What is something you're good at that you take for granted?"},{"date":"01-29","prompt":"Write about a stranger who left an impression on you."},{"date":"01-30","prompt":"What would your 80-year-old self tell you about this exact moment?"},{"date":"01-31","prompt":"Look back at January. What's one thing you're proud of already?"},{"date":"02-01","prompt":"What does love look like in action — not in movies, but in your real life?"},{"date":"02-02","prompt":"Write about a friendship that changed you."},{"date":"02-03","prompt":"What is the kindest thing someone has done for you without being asked?"},{"date":"02-04","prompt":"Describe how you show love. Is it how you want to be loved back?"},{"date":"02-05","prompt":"What is something you love about yourself that has nothing to do with how you look?"},{"date":"02-06","prompt":"Write about a time someone forgave you. How did it feel?"},{"date":"02-07","prompt":"Who do you need to forgive — including yourself?"},{"date":"02-08","prompt":"What is your love language, and when did you first realize it?"},{"date":"02-09","prompt":"Describe the best conversation you've ever had. What made it special?"},{"date":"02-10","prompt":"What do you wish people understood about you?"},{"date":"02-11","prompt":"Write about someone you miss. What would you tell them today?"},{"date":"02-12","prompt":"When do you feel most loved?"},{"date":"02-13","prompt":"What is a small act of kindness you could do tomorrow?"},{"date":"02-14","prompt":"Write a love letter — to a person, a place, a version of yourself, or even a sandwich. No rules."},{"date":"02-15","prompt":"What have your past relationships taught you about what you actually need?"},{"date":"02-16","prompt":"Describe what home feels like to you."},{"date":"02-17","prompt":"What is something you do alone that brings you genuine joy?"},{"date":"02-18","prompt":"Write about a time you felt truly seen by another person."},{"date":"02-19","prompt":"If you could have dinner with anyone, living or dead, who and why?"},{"date":"02-20","prompt":"What boundaries do you need to set — or keep — to protect your peace?"},{"date":"02-21","prompt":"Describe your ideal way to spend a rainy day with someone you love."},{"date":"02-22","prompt":"What is the bravest thing you've ever done for someone else?"},{"date":"02-23","prompt":"Write about a family tradition you want to keep — or start."},{"date":"02-24","prompt":"When was the last time you told someone how much they mean to you?"},{"date":"02-25","prompt":"What does self-compassion look like on your hardest days?"},{"date":"02-26","prompt":"Describe a moment when a stranger's kindness caught you off guard."},{"date":"02-27","prompt":"If you could relive one day with someone you love, which day and why?"},{"date":"02-28","prompt":"What have you learned about love this month — giving it, receiving it, or both?"},{"date":"03-01","prompt":"What is something you're growing into right now, even if it's uncomfortable?"},{"date":"03-02","prompt":"Describe a risk you took that paid off — or taught you something worth the cost."},{"date":"03-03","prompt":"What would you do if you were 10% braver?"},{"date":"03-04","prompt":"Write about a season of your life that felt like spring — everything blooming at once."},{"date":"03-05","prompt":"What is a belief you held strongly that you've since changed your mind about?"},{"date":"03-06","prompt":"If you could master any skill in 30 days, what would it be?"},{"date":"03-07","prompt":"Describe the last time you did something that scared you."},{"date":"03-08","prompt":"Who is a woman or mentor figure who shaped who you are? What did they teach you?"},{"date":"03-09","prompt":"What does courage look like in everyday life — not in movies, but in yours?"},{"date":"03-10","prompt":"Write about something you're in the messy middle of right now."},{"date":"03-11","prompt":"If your comfort zone had walls, what would they be made of?"},{"date":"03-12","prompt":"What is one thing you've been meaning to learn? What's stopping you?"},{"date":"03-13","prompt":"Describe a failure that turned out to be a gift."},{"date":"03-14","prompt":"What would you tell a friend who is afraid to start something new?"},{"date":"03-15","prompt":"Write about the best advice you've ever received. Did you follow it?"},{"date":"03-16","prompt":"What is growing in your life right now — a project, a relationship, a version of you?"},{"date":"03-17","prompt":"If you found a pot of gold, what's the first non-responsible thing you'd do with it?"},{"date":"03-18","prompt":"What habit are you trying to build? How's it really going?"},{"date":"03-19","prompt":"Describe what the first day of spring feels like to you."},{"date":"03-20","prompt":"What is something new you want to try before summer?"},{"date":"03-21","prompt":"Write about a teacher — formal or informal — who changed your trajectory."},{"date":"03-22","prompt":"What does growth actually require of you right now?"},{"date":"03-23","prompt":"If you could go back to school for one subject, what would you study?"},{"date":"03-24","prompt":"Describe a time you had to start over. What did you carry forward?"},{"date":"03-25","prompt":"What is the most useful thing you've learned in the last year?"},{"date":"03-26","prompt":"Write about something you're getting better at, slowly but surely."},{"date":"03-27","prompt":"If you wrote a how-to guide for your own life, what would chapter one be?"},{"date":"03-28","prompt":"What small win can you celebrate today?"},{"date":"03-29","prompt":"Describe the person you were three years ago. What would surprise them about you now?"},{"date":"03-30","prompt":"What are you planting — literally or metaphorically — this season?"},{"date":"03-31","prompt":"What does this month's version of you know that last month's didn't?"},{"date":"04-01","prompt":"What's the biggest harmless prank you've ever pulled — or had pulled on you?"},{"date":"04-02","prompt":"What is a truth about yourself you've been avoiding?"},{"date":"04-03","prompt":"Describe a time when being honest was harder than lying would have been."},{"date":"04-04","prompt":"What would you do with a completely free, unscheduled day?"},{"date":"04-05","prompt":"Write about something you need to let go of."},{"date":"04-06","prompt":"What does a clear mind feel like to you? When did you last have one?"},{"date":"04-07","prompt":"If you could ask your future self one question, what would it be?"},{"date":"04-08","prompt":"Describe your relationship with money in one paragraph — be brutally honest."},{"date":"04-09","prompt":"What is something you pretend to understand but actually don't?"},{"date":"04-10","prompt":"Write about a sibling, cousin, or chosen family member who shaped you."},{"date":"04-11","prompt":"What would you put in a time capsule to represent your life right now?"},{"date":"04-12","prompt":"Describe the last dream you remember. What do you think it meant?"},{"date":"04-13","prompt":"What is one thing you're certain about? What is one thing you're not?"},{"date":"04-14","prompt":"Write about a rainy day that turned out to be perfect."},{"date":"04-15","prompt":"If you had to give a TED talk with no preparation, what would it be about?"},{"date":"04-16","prompt":"What is draining your energy right now? What is restoring it?"},{"date":"04-17","prompt":"Describe the best meal you've ever had — where were you, who were you with?"},{"date":"04-18","prompt":"What do you want to be remembered for?"},{"date":"04-19","prompt":"Write about a moment when everything suddenly made sense."},{"date":"04-20","prompt":"If you could only keep five possessions, what would they be?"},{"date":"04-21","prompt":"What is a question you wish people would ask you more often?"},{"date":"04-22","prompt":"Describe your favorite place in nature. What does it give you?"},{"date":"04-23","prompt":"What book do you wish everyone would read?"},{"date":"04-24","prompt":"Write about something beautiful you noticed this week."},{"date":"04-25","prompt":"If you could have any superpower for 24 hours, what would you do with it?"},{"date":"04-26","prompt":"What is the most important thing on your to-do list that isn't on it?"},{"date":"04-27","prompt":"Describe a time you changed someone's mind — or they changed yours."},{"date":"04-28","prompt":"What would you do if you weren't afraid of looking foolish?"},{"date":"04-29","prompt":"Write about the last time you laughed until it hurt."},{"date":"04-30","prompt":"What clarity have you gained this month?"},{"date":"05-01","prompt":"What are you looking forward to most this month?"},{"date":"05-02","prompt":"Describe your perfect adventure — realistic or wildly unrealistic."},{"date":"05-03","prompt":"What is something that always gives you energy, no matter how tired you are?"},{"date":"05-04","prompt":"If you were a character in a movie, what genre would your life be right now?"},{"date":"05-05","prompt":"Write about a celebration that meant a lot to you."},{"date":"05-06","prompt":"What is a dream you've never told anyone about?"},{"date":"05-07","prompt":"Describe the best road trip you've ever taken — or want to take."},{"date":"05-08","prompt":"What does freedom feel like to you?"},{"date":"05-09","prompt":"Write about your mom, or someone who mothers you, and what they've taught you."},{"date":"05-10","prompt":"If you could teleport anywhere right now, where would you go?"},{"date":"05-11","prompt":"What is something you're curious about but have never explored?"},{"date":"05-12","prompt":"Describe a sunrise or sunset that stopped you in your tracks."},{"date":"05-13","prompt":"What would your ideal Saturday look like from wake-up to bedtime?"},{"date":"05-14","prompt":"Write about a time you got completely lost — literally or figuratively — and what you found."},{"date":"05-15","prompt":"What is the most spontaneous thing you've ever done?"},{"date":"05-16","prompt":"If you could have dinner with your 15-year-old self, what would you talk about?"},{"date":"05-17","prompt":"Describe something you're grateful for that you once took for granted."},{"date":"05-18","prompt":"What is a skill you have that would surprise people?"},{"date":"05-19","prompt":"Write about the ocean, mountains, desert, or forest — whichever calls to you — and why."},{"date":"05-20","prompt":"If you won a free plane ticket to anywhere, where are you going and who's coming?"},{"date":"05-21","prompt":"What is the best piece of advice your dad — or a father figure — gave you?"},{"date":"05-22","prompt":"Describe what feeling fully alive is like in your body."},{"date":"05-23","prompt":"What would you do on your ideal birthday, regardless of your actual age?"},{"date":"05-24","prompt":"Write about a concert, game, or live event that gave you chills."},{"date":"05-25","prompt":"What is something you want to do before the end of summer?"},{"date":"05-26","prompt":"If you could relive one summer day forever, which one?"},{"date":"05-27","prompt":"Describe a mentor or coach who pushed you to be better."},{"date":"05-28","prompt":"What does play look like in your adult life? Do you make time for it?"},{"date":"05-29","prompt":"Write about the funniest thing that happened to you this year so far."},{"date":"05-30","prompt":"If you had to describe your life as a weather forecast, what would today be?"},{"date":"05-31","prompt":"What are you carrying into June that you're excited about?"},{"date":"06-01","prompt":"What does summer mean to you — a feeling, a memory, a smell?"},{"date":"06-02","prompt":"Describe the best summer of your life. What made it magic?"},{"date":"06-03","prompt":"What is something simple that brings you disproportionate joy?"},{"date":"06-04","prompt":"Write about a time you were fully present — not thinking about past or future."},{"date":"06-05","prompt":"If you could bottle one feeling and keep it forever, what would it be?"},{"date":"06-06","prompt":"What is your favorite childhood summer memory?"},{"date":"06-07","prompt":"Describe what relaxation actually looks like for you — not the Instagram version."},{"date":"06-08","prompt":"Who makes you laugh the hardest? Write about the last time."},{"date":"06-09","prompt":"What would you do with a whole week off and no obligations?"},{"date":"06-10","prompt":"Write about water — a pool, a lake, the ocean, a hose in the driveway. What does it remind you of?"},{"date":"06-11","prompt":"What is something you've been putting off that would take less than 10 minutes?"},{"date":"06-12","prompt":"Describe your favorite ice cream flavor and the memories attached to it."},{"date":"06-13","prompt":"What does being present cost you? What does it give you?"},{"date":"06-14","prompt":"Write about a barbecue, picnic, or outdoor meal that felt perfect."},{"date":"06-15","prompt":"If you were a fruit, which one and why? Yes, really. Go deep."},{"date":"06-16","prompt":"What is the best long drive you've ever been on?"},{"date":"06-17","prompt":"Describe a time you stayed up way too late because you were having too much fun."},{"date":"06-18","prompt":"What song instantly puts you in a good mood?"},{"date":"06-19","prompt":"Write about freedom — what it means to you at this exact point in your life."},{"date":"06-20","prompt":"What is something you're looking forward to that you haven't told anyone?"},{"date":"06-21","prompt":"It's the longest day of the year. If you had 3 extra hours of daylight, how would you spend them?"},{"date":"06-22","prompt":"Describe the perfect evening — weather, people, food, everything."},{"date":"06-23","prompt":"What childhood game would you still dominate at today?"},{"date":"06-24","prompt":"Write about someone who radiates joy. What's their secret?"},{"date":"06-25","prompt":"If you could add one holiday to the calendar, what would it celebrate?"},{"date":"06-26","prompt":"What does your body need right now that you've been ignoring?"},{"date":"06-27","prompt":"Describe a stargazing memory — or the one you want to have."},{"date":"06-28","prompt":"What is the silliest thing that has ever made you cry laughing?"},{"date":"06-29","prompt":"Write about what enough looks like in your life."},{"date":"06-30","prompt":"Halfway through the year. What's the headline of your story so far?"},{"date":"07-01","prompt":"What are you most proud of from the first half of this year?"},{"date":"07-02","prompt":"Describe a time you stood up for something — or wish you had."},{"date":"07-03","prompt":"What does independence mean to you?"},{"date":"07-04","prompt":"Write about a fireworks memory — or what you'd wish for if you caught a sparkler's light."},{"date":"07-05","prompt":"What is a tradition you love? What is one you'd like to start?"},{"date":"07-06","prompt":"If you could be famous for one thing, what would it be?"},{"date":"07-07","prompt":"Describe your lucky number and why it feels lucky."},{"date":"07-08","prompt":"What is something you believe that most people don't?"},{"date":"07-09","prompt":"Write about the hottest day you can remember. What got you through it?"},{"date":"07-10","prompt":"What would you do if you had a whole day to be completely selfish?"},{"date":"07-11","prompt":"Describe a moment when you felt powerful."},{"date":"07-12","prompt":"If you could swap lives with anyone for a week, who and why?"},{"date":"07-13","prompt":"What is your biggest what if right now?"},{"date":"07-14","prompt":"Write about a time you trusted your gut and it was right."},{"date":"07-15","prompt":"What does bravery look like at your age, in your life?"},{"date":"07-16","prompt":"If you were a superhero, what would your origin story be?"},{"date":"07-17","prompt":"Describe the best pool, lake, or swimming hole you've ever been in."},{"date":"07-18","prompt":"What is something you've always wanted to say to someone but haven't?"},{"date":"07-19","prompt":"Write about ice cream truck memories — or your equivalent."},{"date":"07-20","prompt":"What would you attempt if no one would ever find out whether you succeeded or failed?"},{"date":"07-21","prompt":"Describe a thunderstorm you remember. Were you scared, thrilled, or at peace?"},{"date":"07-22","prompt":"What is the most courageous thing you've seen someone else do?"},{"date":"07-23","prompt":"If you could time travel to any decade for one day, when and why?"},{"date":"07-24","prompt":"Write about what home smells like."},{"date":"07-25","prompt":"What is a compliment you struggle to accept? Why?"},{"date":"07-26","prompt":"Describe your relationship with your body in one honest paragraph."},{"date":"07-27","prompt":"If you had to survive on a deserted island, what three things would you bring?"},{"date":"07-28","prompt":"Write about a night that felt endless in the best way."},{"date":"07-29","prompt":"What is something you're working on that nobody knows about?"},{"date":"07-30","prompt":"Describe the best surprise you've ever received."},{"date":"07-31","prompt":"What do you want August-you to remember about July-you?"},{"date":"08-01","prompt":"What have you been working toward that is finally starting to pay off?"},{"date":"08-02","prompt":"Describe a time you almost gave up but didn't."},{"date":"08-03","prompt":"What does discipline feel like on the days you don't want to show up?"},{"date":"08-04","prompt":"Write about someone whose work ethic you admire."},{"date":"08-05","prompt":"If you could master one thing through sheer repetition, what would it be?"},{"date":"08-06","prompt":"What is the longest you've ever stuck with something difficult?"},{"date":"08-07","prompt":"Describe what harvest season looks like in your life right now — what are you reaping?"},{"date":"08-08","prompt":"What would you tell yourself during the hardest week of your life?"},{"date":"08-09","prompt":"Write about a book you couldn't put down."},{"date":"08-10","prompt":"What is something you're tired of — and what are you going to do about it?"},{"date":"08-11","prompt":"Describe the most beautiful night sky you've ever seen."},{"date":"08-12","prompt":"If you could have a conversation with any fictional character, who and what would you ask?"},{"date":"08-13","prompt":"What superstitions do you secretly hold?"},{"date":"08-14","prompt":"Write about a time you had to be patient and it was worth it."},{"date":"08-15","prompt":"What is the best thing about where you live right now?"},{"date":"08-16","prompt":"Describe your dream house in ridiculous detail."},{"date":"08-17","prompt":"What would you do with $1,000 you had to spend in 24 hours?"},{"date":"08-18","prompt":"Write about a smell that instantly transports you somewhere."},{"date":"08-19","prompt":"What is a question you've been sitting with lately?"},{"date":"08-20","prompt":"Describe the last time you felt awe."},{"date":"08-21","prompt":"If your life was a video game, what would your current quest be?"},{"date":"08-22","prompt":"What is something you do to calm yourself down that actually works?"},{"date":"08-23","prompt":"Write about the end of summer — what will you miss, what are you ready for?"},{"date":"08-24","prompt":"What is the most interesting thing you've learned recently?"},{"date":"08-25","prompt":"Describe a teacher, coach, or boss who saw potential in you."},{"date":"08-26","prompt":"If you could eat only one cuisine for the rest of your life, what would it be?"},{"date":"08-27","prompt":"What does rest look like when you're actually doing it right?"},{"date":"08-28","prompt":"Write about a song that feels like it was written for you."},{"date":"08-29","prompt":"What is a small luxury you allow yourself?"},{"date":"08-30","prompt":"Describe what you're most looking forward to about fall."},{"date":"08-31","prompt":"What seeds are you planting now that you'll harvest later?"},{"date":"09-01","prompt":"What do you want to learn this fall?"},{"date":"09-02","prompt":"Describe your favorite teacher and what made them great."},{"date":"09-03","prompt":"What is something you used to be terrible at that you're decent at now?"},{"date":"09-04","prompt":"Write about the first day of school — any year that stands out."},{"date":"09-05","prompt":"What would you study if grades didn't matter?"},{"date":"09-06","prompt":"Describe what focus feels like. When do you have it most?"},{"date":"09-07","prompt":"What is a distraction you need to break up with?"},{"date":"09-08","prompt":"Write about a subject you wish you'd paid more attention to."},{"date":"09-09","prompt":"If you could take a gap year right now, what would you do?"},{"date":"09-10","prompt":"What is the most valuable thing school never taught you?"},{"date":"09-11","prompt":"Describe a moment that changed how you see the world."},{"date":"09-12","prompt":"What does starting over feel like at this point in your life?"},{"date":"09-13","prompt":"Write about Friday the 13th — are you superstitious, and about what?"},{"date":"09-14","prompt":"If you could audit any college class for free, which one?"},{"date":"09-15","prompt":"What is a goal you have for the last third of this year?"},{"date":"09-16","prompt":"Describe your ideal workspace. What does it say about you?"},{"date":"09-17","prompt":"What is something you know a lot about that most people don't?"},{"date":"09-18","prompt":"Write about a time you taught someone something. What did you learn from teaching?"},{"date":"09-19","prompt":"If you had to give a 5-minute talk on anything, what would you choose?"},{"date":"09-20","prompt":"What does autumn smell like to you?"},{"date":"09-21","prompt":"Describe a crisp fall day you'd want to bottle up."},{"date":"09-22","prompt":"It's the equinox — equal light and dark. Where in your life do you need more balance?"},{"date":"09-23","prompt":"What is your favorite fall tradition?"},{"date":"09-24","prompt":"Write about a library, bookstore, or reading nook that feels like home."},{"date":"09-25","prompt":"If you could learn any language fluently overnight, which one and why?"},{"date":"09-26","prompt":"What is a project you want to finish before the year ends?"},{"date":"09-27","prompt":"Describe the best autumn drive or walk you've taken."},{"date":"09-28","prompt":"What would your classmates from 10 years ago be surprised to learn about you?"},{"date":"09-29","prompt":"Write about something you're curious about right now — follow the thread."},{"date":"09-30","prompt":"What have you learned about yourself this month?"},{"date":"10-01","prompt":"What are you ready to let go of?"},{"date":"10-02","prompt":"Describe a big change in your life that scared you but worked out."},{"date":"10-03","prompt":"What does transformation actually feel like from the inside?"},{"date":"10-04","prompt":"Write about an animal you've always felt connected to."},{"date":"10-05","prompt":"If you could change one decision from your past, would you? Which one?"},{"date":"10-06","prompt":"What is something you believed as a kid that turned out to be wrong — or right?"},{"date":"10-07","prompt":"Describe your favorite scary movie, book, or story. What draws you to it?"},{"date":"10-08","prompt":"What are you afraid of that you've never said out loud?"},{"date":"10-09","prompt":"Write about a costume or disguise — literal or metaphorical — you've worn."},{"date":"10-10","prompt":"If you could see one hour of your future, which hour would you pick?"},{"date":"10-11","prompt":"What masks do you wear in different parts of your life?"},{"date":"10-12","prompt":"Describe the most mysterious thing that's ever happened to you."},{"date":"10-13","prompt":"What would you do on Friday the 13th if superstition didn't exist?"},{"date":"10-14","prompt":"Write about falling leaves — what are you shedding this season?"},{"date":"10-15","prompt":"If you were a ghost, where would you haunt and why?"},{"date":"10-16","prompt":"What is a secret you've kept — from others or yourself?"},{"date":"10-17","prompt":"Describe your favorite Halloween memory."},{"date":"10-18","prompt":"What would your villain origin story be? Keep it fun."},{"date":"10-19","prompt":"Write about darkness — what it teaches, what it hides, what it reveals."},{"date":"10-20","prompt":"If you could have one magical power, what would it be and what would you do first?"},{"date":"10-21","prompt":"What is something that haunts you — a regret, a memory, a song?"},{"date":"10-22","prompt":"Describe a bonfire night — real or imagined."},{"date":"10-23","prompt":"What would you put in a haunted house designed around your fears?"},{"date":"10-24","prompt":"Write about the difference between being alone and being lonely."},{"date":"10-25","prompt":"If you could talk to ghosts, what's the first thing you'd ask?"},{"date":"10-26","prompt":"What is the scariest movie you've ever seen and why did it get to you?"},{"date":"10-27","prompt":"Describe what courage means when you're genuinely afraid."},{"date":"10-28","prompt":"Write about candy — your favorites, your trading strategies, your heists."},{"date":"10-29","prompt":"If you threw the ultimate Halloween party, what would it look like?"},{"date":"10-30","prompt":"What is one thing you're holding onto that it's time to release?"},{"date":"10-31","prompt":"Happy Halloween! What's the best costume you've ever worn — or wish you had?"},{"date":"11-01","prompt":"What are you most grateful for right now? Don't overthink it."},{"date":"11-02","prompt":"Describe someone who makes your life better just by being in it."},{"date":"11-03","prompt":"What is a comfort you often take for granted?"},{"date":"11-04","prompt":"Write about a meal that felt like love."},{"date":"11-05","prompt":"What is the best gift you've ever received — and why did it matter?"},{"date":"11-06","prompt":"Describe a cozy memory in vivid detail."},{"date":"11-07","prompt":"Who taught you what gratitude means?"},{"date":"11-08","prompt":"What is something difficult you're actually thankful for?"},{"date":"11-09","prompt":"Write a thank-you letter to your body."},{"date":"11-10","prompt":"What small thing made your day better this week?"},{"date":"11-11","prompt":"Describe what service and sacrifice mean to you."},{"date":"11-12","prompt":"What is a privilege you have that you don't think about enough?"},{"date":"11-13","prompt":"It's World Kindness Day. What's the kindest thing you could do today?"},{"date":"11-14","prompt":"Write about your favorite blanket, sweater, or cozy object. What's its story?"},{"date":"11-15","prompt":"What does enough feel like? Are you there?"},{"date":"11-16","prompt":"Describe the best Thanksgiving dish — and who makes it best."},{"date":"11-17","prompt":"What family story gets told every year? Write it down before it's lost."},{"date":"11-18","prompt":"Who would you invite to your ideal Thanksgiving table, living or dead?"},{"date":"11-19","prompt":"Write about a time someone's generosity overwhelmed you."},{"date":"11-20","prompt":"What are three ordinary things that are actually extraordinary?"},{"date":"11-21","prompt":"Describe what home smells like during the holidays."},{"date":"11-22","prompt":"What tradition are you grateful for — or want to start?"},{"date":"11-23","prompt":"Write about someone you don't thank enough."},{"date":"11-24","prompt":"If you had to give a toast at dinner tonight, what would you say?"},{"date":"11-25","prompt":"What is the best thing about the people you love most?"},{"date":"11-26","prompt":"Thanksgiving. List 10 things — big or tiny — you're genuinely thankful for."},{"date":"11-27","prompt":"Describe your favorite leftover — food or otherwise."},{"date":"11-28","prompt":"What does generosity look like when no one is watching?"},{"date":"11-29","prompt":"Write about warmth — a person, a place, a moment that felt warm."},{"date":"11-30","prompt":"As November ends, what are you carrying into December with gratitude?"},{"date":"12-01","prompt":"It's December. What is one thing you want to do before the year ends?"},{"date":"12-02","prompt":"Describe your favorite holiday decoration and the memories attached."},{"date":"12-03","prompt":"What was the best day of this year? Walk through it slowly."},{"date":"12-04","prompt":"Write about giving — the best gift you've ever given."},{"date":"12-05","prompt":"What did this year teach you about yourself?"},{"date":"12-06","prompt":"Describe the perfect snowy day — real or imagined."},{"date":"12-07","prompt":"What is something you accomplished this year that past-you would be proud of?"},{"date":"12-08","prompt":"Write about light — candles, strings of bulbs, sunrise. What does it symbolize for you?"},{"date":"12-09","prompt":"If you could relive one week from this year, which week?"},{"date":"12-10","prompt":"What is the best gift you could give yourself right now? Not a thing."},{"date":"12-11","prompt":"Describe your favorite holiday movie and why it hits every time."},{"date":"12-12","prompt":"What would you put on a mixtape titled with this year?"},{"date":"12-13","prompt":"Write about a winter memory that feels like a snow globe."},{"date":"12-14","prompt":"What is one thing you're leaving behind in this year — gladly?"},{"date":"12-15","prompt":"Describe the best hot drink and the perfect moment to drink it."},{"date":"12-16","prompt":"If you wrote a year-in-review headline for your life, what would it say?"},{"date":"12-17","prompt":"Write about someone who made this year better."},{"date":"12-18","prompt":"What is a holiday tradition you love, hate, or secretly wish existed?"},{"date":"12-19","prompt":"Describe what peace on earth would actually look like, starting with your street."},{"date":"12-20","prompt":"What are you hoping for — not expecting, hoping — in the new year?"},{"date":"12-21","prompt":"It's the longest night of the year. What do you do with the dark?"},{"date":"12-22","prompt":"Write about the best surprise gift you've ever received."},{"date":"12-23","prompt":"What does home for the holidays mean to you?"},{"date":"12-24","prompt":"Christmas Eve. What are you feeling right now — really?"},{"date":"12-25","prompt":"Merry Christmas! What was the best part of today?"},{"date":"12-26","prompt":"Write about rest — the deep kind, after the season's rush."},{"date":"12-27","prompt":"If you could keep one moment from this year in a bottle, which one?"},{"date":"12-28","prompt":"What is unfinished? What are you at peace leaving unfinished?"},{"date":"12-29","prompt":"Describe the person you're becoming. Are you excited to meet them?"},{"date":"12-30","prompt":"Write a letter to next December-you. What do you want them to know?"},{"date":"12-31","prompt":"Last prompt of the year. What three words describe this year, and what three words do you want for the next?"}]};
const PROMPT_MAP = new Map(JOURNAL_PROMPTS_DATA.prompts.map((entry) => [entry.date, entry.prompt]));

/* ============================ sqlite adapter ============================ */

let _sqlite = null;

function plugin() {
  if (_sqlite) return _sqlite;
  const p =
    window.Capacitor &&
    window.Capacitor.Plugins &&
    window.Capacitor.Plugins.CapacitorSQLite;
  if (!p) throw new Error('CapacitorSQLite plugin not available');
  _sqlite = p;
  return _sqlite;
}

/** SELECT -> array of row objects */
async function q(statement, values) {
  const res = await plugin().query({ database: DB_NAME, statement, values: values || [] });
  return (res && res.values) || [];
}

/** INSERT/UPDATE/DELETE */
async function run(statement, values) {
  const res = await plugin().run({ database: DB_NAME, statement, values: values || [] });
  return (res && res.changes) || {};
}

/** DDL / multi-statement */
async function execAll(statements) {
  await plugin().execute({ database: DB_NAME, statements });
}

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ====================== helpers (ported verbatim) ====================== */

function validatedTimezone(value) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format(new Date());
    return value;
  } catch {
    return 'UTC';
  }
}

function dateKeyFor(timezone, value) {
  const v = value || new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(v);
  const year = (parts.find((part) => part.type === 'year') || {}).value || '1970';
  const month = (parts.find((part) => part.type === 'month') || {}).value || '01';
  const day = (parts.find((part) => part.type === 'day') || {}).value || '01';
  return `${year}-${month}-${day}`;
}

function addDays(dateKey, amount) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function weekStartFor(dateKey) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  const offset = (date.getUTCDay() + 6) % 7;
  return addDays(dateKey, -offset);
}

function isSunday(dateKey) {
  return new Date(`${dateKey}T12:00:00Z`).getUTCDay() === 0;
}

/** Daily journal prompt: MM-DD lookup against the 365-prompt collection (Feb 29 -> Feb 28). */
function dailyPromptFor(dateKey) {
  const monthDay = dateKey.slice(5) === '02-29' ? '02-28' : dateKey.slice(5);
  return PROMPT_MAP.get(monthDay) || 'What do you want to remember about today?';
}

function titleFor(task, intensity) {
  if (intensity === 'chill') return task.chillTitle;
  if (intensity === 'beast') return task.beastTitle;
  return task.balancedTitle;
}

function progression(totalXp) {
  const thresholds = [0, 100, 250, 500, 850];
  while ((thresholds[thresholds.length - 1] || 0) <= totalXp) {
    const currentLevel = thresholds.length;
    const increment = 350 + Math.max(1, currentLevel - 4) * 100;
    thresholds.push((thresholds[thresholds.length - 1] || 0) + increment);
  }
  let level = 1;
  for (let index = 0; index < thresholds.length; index += 1) {
    const threshold = thresholds[index] || 0;
    if (totalXp >= threshold) level = index + 1;
  }
  const currentThreshold = thresholds[level - 1] || 0;
  const nextThreshold = thresholds[level] || currentThreshold + 500;
  return {
    level,
    currentThreshold,
    nextThreshold,
    progress: Math.max(0, Math.min(1, (totalXp - currentThreshold) / Math.max(1, nextThreshold - currentThreshold))),
    remaining: Math.max(0, nextThreshold - totalXp),
  };
}

function computeStreak(activeDates, today) {
  let cursor = activeDates.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (activeDates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/* ============================ row mappers ============================ */
/* Normalize snake_case SQLite rows to the camelCase shapes the ported
 * business logic expects (mirrors drizzle's $inferSelect). */

function mapProfileRow(r) {
  return {
    id: r.id,
    timezone: r.timezone,
    onboardingComplete: r.onboarding_complete === 1,
    themeMode: r.theme_mode,
    accentColor: r.accent_color,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapTaskRow(r) {
  return {
    id: r.id,
    categoryId: r.category_id,
    chillTitle: r.chill_title,
    balancedTitle: r.balanced_title,
    beastTitle: r.beast_title,
    enabled: r.enabled === 1,
    isCustom: r.is_custom === 1,
    deleted: r.deleted === 1,
    sortOrder: r.sort_order,
    updatedAt: r.updated_at,
  };
}

function mapCompletionRow(r) {
  return {
    id: r.id,
    taskId: r.task_id,
    categoryId: r.category_id,
    dateKey: r.date_key,
    xpAwarded: r.xp_awarded,
    completedAt: r.completed_at,
  };
}

function mapJournalRow(r) {
  return {
    id: r.id,
    dateKey: r.date_key,
    prompt: r.prompt,
    content: r.content,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function mapAwardRow(r) {
  return {
    id: r.id,
    templateId: r.template_id,
    weekStart: r.week_start,
    title: r.title,
    badgeName: r.badge_name,
    bonusXp: r.bonus_xp,
    awardedAt: r.awarded_at,
  };
}

function mapRecapRow(r) {
  return {
    id: r.id,
    weekStart: r.week_start,
    weekEnd: r.week_end,
    totalXp: r.total_xp,
    tasksCompleted: r.tasks_completed,
    bestDay: r.best_day,
    bestDayCount: r.best_day_count,
    longestStreak: r.longest_streak,
    breakdownJson: r.breakdown_json,
    insight: r.insight,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/* ================================ DDL ================================ */
/* Consolidated from drizzle/0001_initial.sql .. 0006_quest_chains_and_weekly_recaps.sql */

const DDL = `
CREATE TABLE IF NOT EXISTS wellness_profile (
  id INTEGER PRIMARY KEY NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  onboarding_complete INTEGER NOT NULL DEFAULT 0,
  theme_mode TEXT DEFAULT 'dark' NOT NULL,
  accent_color TEXT DEFAULT 'teal' NOT NULL
);
CREATE TABLE IF NOT EXISTS category_settings (
  category_id TEXT PRIMARY KEY NOT NULL,
  intensity TEXT NOT NULL DEFAULT 'balanced',
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS quest_tasks (
  id TEXT PRIMARY KEY NOT NULL,
  category_id TEXT NOT NULL,
  chill_title TEXT NOT NULL,
  balanced_title TEXT NOT NULL,
  beast_title TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  is_custom INTEGER DEFAULT 0 NOT NULL,
  deleted INTEGER DEFAULT 0 NOT NULL
);
CREATE INDEX IF NOT EXISTS quest_tasks_category_idx ON quest_tasks(category_id, sort_order);
CREATE TABLE IF NOT EXISTS task_completions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  date_key TEXT NOT NULL,
  xp_awarded INTEGER NOT NULL,
  completed_at INTEGER NOT NULL,
  UNIQUE(task_id, date_key)
);
CREATE INDEX IF NOT EXISTS task_completions_date_idx ON task_completions(date_key);
CREATE INDEX IF NOT EXISTS task_completions_category_idx ON task_completions(category_id);
CREATE TABLE IF NOT EXISTS journal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date_key TEXT NOT NULL UNIQUE,
  prompt TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS journal_entries_date_idx ON journal_entries(date_key);
CREATE TABLE IF NOT EXISTS quest_chain_awards (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  template_id TEXT NOT NULL,
  week_start TEXT NOT NULL,
  title TEXT NOT NULL,
  badge_name TEXT NOT NULL,
  bonus_xp INTEGER NOT NULL,
  awarded_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS quest_chain_awards_week_start_unique ON quest_chain_awards(week_start);
CREATE INDEX IF NOT EXISTS quest_chain_awards_week_idx ON quest_chain_awards(week_start);
CREATE TABLE IF NOT EXISTS weekly_recaps (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  week_start TEXT NOT NULL,
  week_end TEXT NOT NULL,
  total_xp INTEGER NOT NULL,
  tasks_completed INTEGER NOT NULL,
  best_day TEXT NOT NULL,
  best_day_count INTEGER NOT NULL,
  longest_streak INTEGER NOT NULL,
  breakdown_json TEXT NOT NULL,
  insight TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS weekly_recaps_week_start_unique ON weekly_recaps(week_start);
CREATE INDEX IF NOT EXISTS weekly_recaps_week_idx ON weekly_recaps(week_start);
`;

/* =========================== ensureDefaults =========================== */

async function ensureDefaults(timezoneInput) {
  const timezone = validatedTimezone(timezoneInput);
  const now = Date.now();
  await run(
    `INSERT INTO wellness_profile (id, timezone, created_at, updated_at)
     VALUES (1, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET timezone = excluded.timezone, updated_at = excluded.updated_at`,
    [timezone, now, now]
  );
  for (const categoryId of CATEGORY_IDS) {
    await run(`INSERT OR IGNORE INTO category_settings (category_id, intensity, updated_at) VALUES (?, 'balanced', ?)`, [categoryId, now]);
  }
  for (const task of DEFAULT_TASKS) {
    await run(
      `INSERT OR IGNORE INTO quest_tasks (id, category_id, chill_title, balanced_title, beast_title, enabled, sort_order, updated_at)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      [task.id, task.categoryId, task.chillTitle, task.balancedTitle, task.beastTitle, task.sortOrder, now]
    );
  }
  return { timezone, today: dateKeyFor(timezone) };
}

/* ========================= buildAppSnapshot ========================= */

async function buildAppSnapshot(timezoneInput) {
  const { timezone, today } = await ensureDefaults(timezoneInput);

  const profileRows = (await q(`SELECT * FROM wellness_profile WHERE id = 1 LIMIT 1`)).map(mapProfileRow);
  const settingsRows = await q(`SELECT * FROM category_settings`);
  const taskRows = (await q(`SELECT * FROM quest_tasks ORDER BY sort_order ASC`)).map(mapTaskRow);
  const completionRows = (await q(`SELECT * FROM task_completions ORDER BY completed_at DESC`)).map(mapCompletionRow);
  const journalRows = (await q(`SELECT * FROM journal_entries ORDER BY date_key DESC LIMIT 60`)).map(mapJournalRow);

  const settings = new Map(settingsRows.map((row) => [row.category_id, row.intensity]));
  const todayCompletedIds = new Set(completionRows.filter((row) => row.dateKey === today).map((row) => row.taskId));
  const activeDates = new Set(completionRows.map((row) => row.dateKey));

  const categories = CATEGORY_IDS.map((categoryId) => {
    const intensity = settings.get(categoryId) || 'balanced';
    const categoryTasks = taskRows
      .filter((task) => task.categoryId === categoryId && !task.deleted)
      .map((task) => ({
        id: task.id,
        categoryId,
        title: titleFor(task, intensity),
        enabled: task.enabled,
        completed: todayCompletedIds.has(task.id),
        isCustom: task.isCustom,
      }));
    const enabledTasks = categoryTasks.filter((task) => task.enabled);
    return {
      id: categoryId,
      name: CATEGORY_META[categoryId].name,
      icon: CATEGORY_META[categoryId].icon,
      description: CATEGORY_META[categoryId].description,
      intensity,
      xpPerTask: XP_BY_INTENSITY[intensity],
      completedCount: enabledTasks.filter((task) => task.completed).length,
      totalCount: enabledTasks.length,
      tasks: categoryTasks,
    };
  });

  const weekStart = weekStartFor(today);
  const weekEnd = addDays(weekStart, 6);
  const activeCategoryIds = new Set(categories.filter((category) => category.totalCount > 0).map((category) => category.id));
  const weekOrdinal = Math.floor(new Date(`${weekStart}T12:00:00Z`).getTime() / 604800000);
  let selectedTemplate;
  for (let offset = 0; offset < QUEST_CHAINS.length; offset += 1) {
    const candidate = QUEST_CHAINS[(Math.abs(weekOrdinal) + offset) % QUEST_CHAINS.length];
    if (candidate && candidate.categories.every((categoryId) => activeCategoryIds.has(categoryId))) {
      selectedTemplate = candidate;
      break;
    }
  }
  const weekRows = completionRows.filter((row) => row.dateKey >= weekStart && row.dateKey <= weekEnd);
  const completedQuestDays = selectedTemplate
    ? Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)).filter((date) =>
        selectedTemplate.categories.every((categoryId) =>
          weekRows.some((row) => row.dateKey === date && row.categoryId === categoryId)
        )
      ).length
    : 0;

  const existingAwards = (await q(`SELECT * FROM quest_chain_awards`)).map(mapAwardRow);
  if (selectedTemplate && completedQuestDays === 7 && !existingAwards.some((award) => award.weekStart === weekStart)) {
    await run(
      `INSERT INTO quest_chain_awards (template_id, week_start, title, badge_name, bonus_xp, awarded_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [selectedTemplate.id, weekStart, selectedTemplate.title, selectedTemplate.badge, selectedTemplate.bonusXp, Date.now()]
    );
  }

  if (isSunday(today)) {
    const byDate = new Map();
    for (const row of weekRows) byDate.set(row.dateKey, (byDate.get(row.dateKey) || 0) + 1);
    const rankedDays = [...byDate.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
    const bestDay = (rankedDays[0] && rankedDays[0][0]) || weekStart;
    const bestDayCount = (rankedDays[0] && rankedDays[0][1]) || 0;
    let longestStreak = 0;
    let runningStreak = 0;
    for (let index = 0; index < 7; index += 1) {
      if ((byDate.get(addDays(weekStart, index)) || 0) > 0) {
        runningStreak += 1;
        longestStreak = Math.max(longestStreak, runningStreak);
      } else {
        runningStreak = 0;
      }
    }
    const breakdown = CATEGORY_IDS.map((categoryId) => ({
      categoryId,
      name: CATEGORY_META[categoryId].name,
      count: weekRows.filter((row) => row.categoryId === categoryId).length,
      xp: weekRows.filter((row) => row.categoryId === categoryId).reduce((sum, row) => sum + row.xpAwarded, 0),
    }));
    const strongest = [...breakdown].sort((a, b) => b.count - a.count)[0];
    const insight =
      strongest && strongest.count > 0
        ? `You showed up strongest for ${strongest.name} — ${strongest.count} task${strongest.count === 1 ? '' : 's'} completed.`
        : 'A new week is a fresh chance to build momentum.';
    const nowMs = Date.now();
    const existingRecapRows = await q(`SELECT * FROM weekly_recaps WHERE week_start = ? LIMIT 1`, [weekStart]);
    if (existingRecapRows[0]) {
      await run(
        `UPDATE weekly_recaps SET week_end = ?, total_xp = ?, tasks_completed = ?, best_day = ?, best_day_count = ?,
         longest_streak = ?, breakdown_json = ?, insight = ?, updated_at = ? WHERE id = ?`,
        [
          weekEnd,
          weekRows.reduce((sum, row) => sum + row.xpAwarded, 0),
          weekRows.length,
          bestDay,
          bestDayCount,
          longestStreak,
          JSON.stringify(breakdown),
          insight,
          nowMs,
          existingRecapRows[0].id,
        ]
      );
    } else {
      await run(
        `INSERT INTO weekly_recaps (week_start, week_end, total_xp, tasks_completed, best_day, best_day_count,
         longest_streak, breakdown_json, insight, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          weekStart,
          weekEnd,
          weekRows.reduce((sum, row) => sum + row.xpAwarded, 0),
          weekRows.length,
          bestDay,
          bestDayCount,
          longestStreak,
          JSON.stringify(breakdown),
          insight,
          nowMs,
          nowMs,
        ]
      );
    }
  }

  const awardRows = (await q(`SELECT * FROM quest_chain_awards ORDER BY week_start DESC`)).map(mapAwardRow);
  const recapRows = (await q(`SELECT * FROM weekly_recaps ORDER BY week_start DESC LIMIT 52`)).map(mapRecapRow);

  const completionXp = completionRows.reduce((sum, row) => sum + row.xpAwarded, 0);
  const totalXp = completionXp + awardRows.reduce((sum, row) => sum + row.bonusXp, 0);

  const xpBreakdown = CATEGORY_IDS.map((categoryId) => ({
    categoryId,
    name: CATEGORY_META[categoryId].name,
    xp: completionRows.filter((row) => row.categoryId === categoryId).reduce((sum, row) => sum + row.xpAwarded, 0),
  }));

  const calendar = Array.from({ length: 30 }, (_, index) => addDays(today, index - 29)).map((date) => ({
    date,
    active: activeDates.has(date),
    count: completionRows.filter((row) => row.dateKey === date).length,
  }));

  const parseRecap = (row) => ({
    id: row.id,
    weekStart: row.weekStart,
    weekEnd: row.weekEnd,
    totalXp: row.totalXp,
    tasksCompleted: row.tasksCompleted,
    bestDay: row.bestDay,
    bestDayCount: row.bestDayCount,
    longestStreak: row.longestStreak,
    breakdown: JSON.parse(row.breakdownJson),
    insight: row.insight,
  });

  const todayEntry = journalRows.find((entry) => entry.dateKey === today);
  const currentRecapRow = recapRows.find((row) => row.weekStart === weekStart);

  return {
    today,
    timezone,
    onboardingComplete: (profileRows[0] && profileRows[0].onboardingComplete) || false,
    themeMode: (profileRows[0] && profileRows[0].themeMode) || 'dark',
    accentColor: (profileRows[0] && profileRows[0].accentColor) || 'teal',
    prompt: (todayEntry && todayEntry.prompt) || dailyPromptFor(today),
    todayJournal: (todayEntry && todayEntry.content) || '',
    totalXp,
    level: progression(totalXp),
    streak: computeStreak(activeDates, today),
    todayCompleted: categories.reduce((sum, category) => sum + category.completedCount, 0),
    todayTotal: categories.reduce((sum, category) => sum + category.totalCount, 0),
    categories,
    xpBreakdown,
    calendar,
    journalHistory: journalRows.map((entry) => ({
      id: entry.id,
      date: entry.dateKey,
      prompt: entry.prompt,
      content: entry.content,
      updatedAt: new Date(entry.updatedAt).toISOString(),
    })),
    activeQuestChain: selectedTemplate
      ? {
          id: selectedTemplate.id,
          title: selectedTemplate.title,
          description: selectedTemplate.description,
          requiredCategories: selectedTemplate.categories.map((categoryId) => ({
            id: categoryId,
            name: CATEGORY_META[categoryId].name,
          })),
          daysCompleted: completedQuestDays,
          daysRequired: 7,
          bonusXp: selectedTemplate.bonusXp,
          badge: selectedTemplate.badge,
          completed: completedQuestDays === 7,
          weekStart,
          weekEnd,
        }
      : null,
    currentRecap: isSunday(today) && currentRecapRow ? parseRecap(currentRecapRow) : null,
    recapHistory: recapRows.map(parseRecap),
    badges: awardRows.map((row) => ({
      title: row.title,
      badge: row.badgeName,
      bonusXp: row.bonusXp,
      weekStart: row.weekStart,
      awardedAt: new Date(row.awardedAt).toISOString(),
    })),
  };
}

/* ============================== actions ============================== */

async function loadApp(args) {
  return buildAppSnapshot(args.timezone);
}

async function completeOnboarding(args) {
  await ensureDefaults(args.timezone);
  const settingsByCategory = new Map(args.settings.map((setting) => [setting.categoryId, setting.intensity]));
  if (settingsByCategory.size !== CATEGORY_IDS.length) throw new Error('Choose an intensity for every category');
  const now = Date.now();
  for (const categoryId of CATEGORY_IDS) {
    const intensity = settingsByCategory.get(categoryId) || 'chill';
    await run(`UPDATE category_settings SET intensity = ?, updated_at = ? WHERE category_id = ?`, [intensity, now, categoryId]);
  }
  await run(`UPDATE wellness_profile SET onboarding_complete = 1, updated_at = ? WHERE id = 1`, [now]);
  return { ok: true };
}

function mutationResult(xpChange, beforeXp, streakMilestone) {
  const newXp = beforeXp + xpChange;
  const beforeLevel = progression(beforeXp).level;
  const newProgress = progression(newXp);
  const newLevel = newProgress.level;
  return {
    ok: true,
    xpChange,
    levelUp: newLevel > beforeLevel,
    newLevel,
    streakMilestone,
    newTotalXp: newXp,
    levelProgress: newProgress.progress,
    xpRemaining: newProgress.remaining,
  };
}

async function setTaskCompletion(args) {
  const { taskId, completed, timezone } = args;
  const { today } = await ensureDefaults(timezone);
  const taskRows = (await q(`SELECT * FROM quest_tasks WHERE id = ? LIMIT 1`, [taskId])).map(mapTaskRow);
  const task = taskRows[0];
  if (!task || task.deleted) throw new Error('Quest not found');

  const existingRows = (
    await q(`SELECT * FROM task_completions WHERE task_id = ? AND date_key = ? LIMIT 1`, [taskId, today])
  ).map(mapCompletionRow);
  const existing = existingRows[0];
  const beforeRows = (await q(`SELECT * FROM task_completions`)).map(mapCompletionRow);
  const beforeXp = beforeRows.reduce((sum, row) => sum + row.xpAwarded, 0);

  let xpChange = 0;
  let streakMilestone = false;

  if (completed && !existing && task.enabled) {
    const settingRows = await q(`SELECT * FROM category_settings WHERE category_id = ? LIMIT 1`, [task.categoryId]);
    const intensity = (settingRows[0] && settingRows[0].intensity) || 'balanced';
    const xp = XP_BY_INTENSITY[intensity];
    const todayWasInactive = !beforeRows.some((row) => row.dateKey === today);
    await run(
      `INSERT INTO task_completions (task_id, category_id, date_key, xp_awarded, completed_at) VALUES (?, ?, ?, ?, ?)`,
      [task.id, task.categoryId, today, xp, Date.now()]
    );
    xpChange = xp;
    if (todayWasInactive) {
      const activeDates = new Set([...beforeRows.map((row) => row.dateKey), today]);
      const streak = computeStreak(activeDates, today);
      streakMilestone = STREAK_MILESTONES.includes(streak);
    }
  } else if (!completed && existing) {
    await run(`DELETE FROM task_completions WHERE id = ?`, [existing.id]);
    xpChange = -existing.xpAwarded;
  }

  return mutationResult(xpChange, beforeXp, streakMilestone);
}

async function setAppearance(args) {
  await ensureDefaults(args.timezone);
  await run(`UPDATE wellness_profile SET theme_mode = ?, accent_color = ?, updated_at = ? WHERE id = 1`, [
    args.themeMode,
    args.accentColor,
    Date.now(),
  ]);
  return { ok: true };
}

async function setIntensity(args) {
  await ensureDefaults(args.timezone);
  await run(`UPDATE category_settings SET intensity = ?, updated_at = ? WHERE category_id = ?`, [
    args.intensity,
    Date.now(),
    args.categoryId,
  ]);
  return { ok: true };
}

async function setTaskEnabled(args) {
  await ensureDefaults(args.timezone);
  await run(`UPDATE quest_tasks SET enabled = ?, updated_at = ? WHERE id = ? AND deleted = 0`, [
    args.enabled ? 1 : 0,
    Date.now(),
    args.taskId,
  ]);
  return { ok: true };
}

async function addTask(args) {
  const { categoryId, timezone } = args;
  const title = (args.title || '').trim();
  if (!title) throw new Error('Task title is required');
  await ensureDefaults(timezone);
  const existing = await q(`SELECT sort_order FROM quest_tasks WHERE category_id = ? ORDER BY sort_order DESC LIMIT 1`, [categoryId]);
  const sortOrder = ((existing[0] && existing[0].sort_order) || 0) + 1;
  await run(
    `INSERT INTO quest_tasks (id, category_id, chill_title, balanced_title, beast_title, enabled, is_custom, deleted, sort_order, updated_at)
     VALUES (?, ?, ?, ?, ?, 1, 1, 0, ?, ?)`,
    [`custom-${uuid()}`, categoryId, title, title, title, sortOrder, Date.now()]
  );
  return { ok: true };
}

async function removeTask(args) {
  await ensureDefaults(args.timezone);
  await run(`UPDATE quest_tasks SET deleted = 1, enabled = 0, updated_at = ? WHERE id = ?`, [Date.now(), args.taskId]);
  return { ok: true };
}

async function saveJournal(args) {
  const { timezone } = args;
  const content = (args.content || '').trim();
  const promptArg = (args.prompt || '').trim();
  if (!content) throw new Error('Journal content is required');
  const { today } = await ensureDefaults(timezone);
  const now = Date.now();

  const existingRows = (await q(`SELECT * FROM journal_entries WHERE date_key = ? LIMIT 1`, [today])).map(mapJournalRow);
  const existingEntry = existingRows[0];
  await run(
    `INSERT INTO journal_entries (date_key, prompt, content, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(date_key) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`,
    [today, (existingEntry && existingEntry.prompt) || promptArg, content, (existingEntry && existingEntry.createdAt) || now, now]
  );

  const taskRows = (await q(`SELECT * FROM quest_tasks WHERE id = 'journaling-prompt' LIMIT 1`)).map(mapTaskRow);
  const promptTask = taskRows[0];
  const completionRows = (
    await q(`SELECT * FROM task_completions WHERE task_id = 'journaling-prompt' AND date_key = ? LIMIT 1`, [today])
  ).map(mapCompletionRow);
  const existingCompletion = completionRows[0];
  const beforeRows = (await q(`SELECT * FROM task_completions`)).map(mapCompletionRow);
  const beforeXp = beforeRows.reduce((sum, row) => sum + row.xpAwarded, 0);

  let xpChange = 0;
  let streakMilestone = false;
  if (promptTask && promptTask.enabled && !promptTask.deleted && !existingCompletion) {
    const settingRows = await q(`SELECT * FROM category_settings WHERE category_id = 'journaling' LIMIT 1`);
    const intensity = (settingRows[0] && settingRows[0].intensity) || 'balanced';
    xpChange = XP_BY_INTENSITY[intensity];
    const todayWasInactive = !beforeRows.some((row) => row.dateKey === today);
    await run(
      `INSERT INTO task_completions (task_id, category_id, date_key, xp_awarded, completed_at) VALUES (?, ?, ?, ?, ?)`,
      [promptTask.id, 'journaling', today, xpChange, now]
    );
    if (todayWasInactive) {
      const activeDates = new Set([...beforeRows.map((row) => row.dateKey), today]);
      streakMilestone = STREAK_MILESTONES.includes(computeStreak(activeDates, today));
    }
  }

  return mutationResult(xpChange, beforeXp, streakMilestone);
}

async function resetData(args) {
  await ensureDefaults(args.timezone);
  const now = Date.now();
  await run(`DELETE FROM task_completions`);
  await run(`DELETE FROM journal_entries`);
  await run(`UPDATE category_settings SET intensity = 'balanced', updated_at = ?`, [now]);
  await run(`UPDATE quest_tasks SET enabled = 1, updated_at = ?`, [now]);
  return { ok: true };
}

/* ============================ init/export ============================ */

const ACTIONS = {
  loadApp,
  completeOnboarding,
  setTaskCompletion,
  setAppearance,
  setIntensity,
  setTaskEnabled,
  addTask,
  removeTask,
  saveJournal,
  resetData,
};

async function init() {
  const p = plugin();
  try {
    await p.createConnection({ database: DB_NAME });
  } catch (e) {
    // Connection may already exist from a previous init; continue to open.
  }
  await p.open({ database: DB_NAME });
  await p.execute({ database: DB_NAME, statements: DDL });
}

async function callAction(actionName, args) {
  const fn = ACTIONS[actionName];
  if (!fn) throw new Error(`Unknown action: ${actionName}`);
  return fn(args || {});
}

window.WellnessQuestNative = { init, callAction, _initialized: false };

// Auto-initialize on load
(function() {
  function tryInit() {
    // Wait for Capacitor to be ready
    if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.CapacitorSQLite) {
      init().then(() => {
        window.WellnessQuestNative._initialized = true;
        console.log('[native-actions] Initialized successfully');
      }).catch(err => {
        console.error('[native-actions] Init failed:', err);
        // Mark as initialized anyway so the bridge installs; actions will fail with clear errors
        window.WellnessQuestNative._initialized = true;
        window.WellnessQuestNative._initError = err;
      });
    } else {
      setTimeout(tryInit, 100);
    }
  }
  // Start trying after a short delay to let Capacitor load
  setTimeout(tryInit, 500);
})();
