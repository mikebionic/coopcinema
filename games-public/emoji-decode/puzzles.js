// ============================================
// EMOJI DECODE - Puzzle Database
// Each puzzle: { emoji, answer, hint, category }
// ============================================

var PUZZLES = [
    // Movies
    { emoji: '🦁👑', answer: 'The Lion King', hint: 'Disney classic about royalty in Africa', category: 'Movie' },
    { emoji: '🧙‍♂️💍🌋', answer: 'Lord of the Rings', hint: 'One ring to rule them all', category: 'Movie' },
    { emoji: '⭐️⚔️🌌', answer: 'Star Wars', hint: 'A galaxy far, far away', category: 'Movie' },
    { emoji: '🦇🦸‍♂️🌃', answer: 'Batman', hint: 'Dark Knight of Gotham', category: 'Movie' },
    { emoji: '🕷️🦸‍♂️🏙️', answer: 'Spider-Man', hint: 'Friendly neighborhood hero', category: 'Movie' },
    { emoji: '🧊🚢💔', answer: 'Titanic', hint: 'Unsinkable ship, 1997 blockbuster', category: 'Movie' },
    { emoji: '👻👻🔫', answer: 'Ghostbusters', hint: 'Who you gonna call?', category: 'Movie' },
    { emoji: '🏠🔑👦🎄', answer: 'Home Alone', hint: 'Kid defends house during Christmas', category: 'Movie' },
    { emoji: '🧟‍♂️🌍🔫', answer: 'World War Z', hint: 'Brad Pitt vs the undead', category: 'Movie' },
    { emoji: '🐠🔍', answer: 'Finding Nemo', hint: 'A father searches the ocean', category: 'Movie' },
    { emoji: '🐀👨‍🍳🇫🇷', answer: 'Ratatouille', hint: 'A rat who cooks in Paris', category: 'Movie' },
    { emoji: '🤖❤️🌱', answer: 'Wall-E', hint: 'Lonely robot finds love', category: 'Movie' },
    { emoji: '🦖🏝️🧬', answer: 'Jurassic Park', hint: 'Life finds a way', category: 'Movie' },
    { emoji: '🔨⚡🇳🇴', answer: 'Thor', hint: 'Norse god of thunder', category: 'Movie' },
    { emoji: '👸❄️⛄', answer: 'Frozen', hint: 'Let it go!', category: 'Movie' },
    { emoji: '🤡🎈🔪', answer: 'It', hint: 'Stephen King clown horror', category: 'Movie' },
    { emoji: '🏴‍☠️🚢💀', answer: 'Pirates of the Caribbean', hint: 'Captain Jack Sparrow', category: 'Movie' },
    { emoji: '👽📞🏠', answer: 'E.T.', hint: 'Phone home', category: 'Movie' },
    { emoji: '🧪💚👊', answer: 'The Hulk', hint: 'Don\'t make him angry', category: 'Movie' },
    { emoji: '🎩🐇✨', answer: 'The Prestige', hint: 'Two rival magicians', category: 'Movie' },
    { emoji: '🐉👩‍🦰🏰', answer: 'Shrek', hint: 'Ogre rescues a princess', category: 'Movie' },
    { emoji: '🚗⚡🔙⏰', answer: 'Back to the Future', hint: '88 miles per hour!', category: 'Movie' },
    { emoji: '💀👰🎹', answer: 'Corpse Bride', hint: 'Tim Burton animated romance', category: 'Movie' },
    { emoji: '🦈🏖️😱', answer: 'Jaws', hint: 'You\'re gonna need a bigger boat', category: 'Movie' },
    { emoji: '🐼🥋🍜', answer: 'Kung Fu Panda', hint: 'Inner peace with noodle soup', category: 'Movie' },

    // TV Shows
    { emoji: '👨‍🔬💊💰', answer: 'Breaking Bad', hint: 'Chemistry teacher turns drug lord', category: 'TV Show' },
    { emoji: '👑🗡️🐉', answer: 'Game of Thrones', hint: 'Winter is coming', category: 'TV Show' },
    { emoji: '🧟‍♂️🔫👥', answer: 'The Walking Dead', hint: 'Surviving the zombie apocalypse', category: 'TV Show' },
    { emoji: '🔬👩‍🔬🤓', answer: 'The Big Bang Theory', hint: 'Nerdy physicists sitcom', category: 'TV Show' },
    { emoji: '🏢📋😐', answer: 'The Office', hint: 'That\'s what she said', category: 'TV Show' },

    // Phrases & Expressions
    { emoji: '🐘🧠', answer: 'Elephant Memory', hint: 'Never forgets', category: 'Phrase' },
    { emoji: '💔🥛', answer: 'Cry Over Spilt Milk', hint: 'Regret something that\'s done', category: 'Phrase' },
    { emoji: '🐱👜', answer: 'Cat in the Bag', hint: 'A secret revealed', category: 'Phrase' },
    { emoji: '🌧️🐱🐶', answer: 'Raining Cats and Dogs', hint: 'Very heavy rainfall', category: 'Phrase' },
    { emoji: '🍎🌳', answer: 'Apple of My Eye', hint: 'Someone you cherish deeply', category: 'Phrase' },

    // Songs
    { emoji: '🎤👸💃', answer: 'Single Ladies', hint: 'Put a ring on it', category: 'Song' },
    { emoji: '🌧️☔😭', answer: 'Crying in the Rain', hint: 'Hiding tears in weather', category: 'Song' },
    { emoji: '🎸🏨🦅', answer: 'Hotel California', hint: 'You can check out but never leave', category: 'Song' },
    { emoji: '💎🌌🎵', answer: 'Lucy in the Sky with Diamonds', hint: 'Beatles psychedelic classic', category: 'Song' },
    { emoji: '🦁😴🌙', answer: 'The Lion Sleeps Tonight', hint: 'A-wimoweh!', category: 'Song' },
    { emoji: '🌅🎵🎤', answer: 'Here Comes the Sun', hint: 'Beatles song about sunrise', category: 'Song' },
    { emoji: '🎹🔥👨', answer: 'Piano Man', hint: 'Billy Joel classic', category: 'Song' },
    { emoji: '💜🌧️', answer: 'Purple Rain', hint: 'Prince\'s masterpiece', category: 'Song' },
    { emoji: '🚀👨‍🚀⭐', answer: 'Rocket Man', hint: 'Elton John in space', category: 'Song' },
    { emoji: '🎄🏠🎅', answer: 'Home for Christmas', hint: 'Holiday classic wish', category: 'Song' },
];
