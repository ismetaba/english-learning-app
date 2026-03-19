import { DialogueLine, WordTimestamp } from '@/data/scenes';

export interface Clip {
  id: string;
  youtubeVideoId: string;
  movieTitle: string;
  startTime: number;
  endTime: number;
  lines: DialogueLine[];
}

export interface ClipPlaylist {
  id: string;
  title: string;
  description: string;
  clips: Clip[];
  vocabFocus: string[];
}

export const playlists: ClipPlaylist[] = [
  {
    id: 'adjectives-in-movies',
    title: 'Adjectives & Descriptions',
    description: 'Learn how adjectives are used in real movie dialogue.',
    vocabFocus: ['nice', 'hard', 'good', 'special', 'picky', 'pretty', 'happy', 'stupid', 'creepy', 'worth'],
    clips: [
      {
        id: 'frozen-weather',
        youtubeVideoId: 'TbQm5doF_Uc',
        movieTitle: 'Frozen',
        startTime: 10,
        endTime: 17,
        lines: [
          { speaker: 'Speaker', text: "It couldn't be warmer.", lineStartTime: 10.6, lineEndTime: 11.7 },
          { speaker: 'Speaker', text: "It couldn't be sunnier.", lineStartTime: 12.2, lineEndTime: 13.4 },
          { speaker: 'Speaker', text: "But that's about to change forever.", lineStartTime: 13.9, lineEndTime: 16.7 },
        ],
      },
      {
        id: 'ratatouille-cheese',
        youtubeVideoId: 'NgsQ8mVkN8w',
        movieTitle: 'Ratatouille',
        startTime: 21,
        endTime: 35,
        lines: [
          { speaker: 'Speaker', text: 'To start, we have an excellent cloche at creamy, very nice, very light.', lineStartTime: 21.5, lineEndTime: 25.4 },
          { speaker: 'Speaker', text: "And finally, the pastry's the stones are very special, very well.", lineStartTime: 30.5, lineEndTime: 34.9 },
        ],
      },
      {
        id: 'ratatouille-food',
        youtubeVideoId: 'NgsQ8mVkN8w',
        movieTitle: 'Ratatouille',
        startTime: 55,
        endTime: 70,
        lines: [
          { speaker: 'Speaker', text: 'I like good food, okay?', lineStartTime: 57.4, lineEndTime: 58.9 },
          { speaker: 'Speaker', text: 'And good food is hard for a rat to find.', lineStartTime: 58.9, lineEndTime: 63.2 },
          { speaker: 'Speaker', text: "It wouldn't be so hard to find if you weren't so picky.", lineStartTime: 63.5, lineEndTime: 66.7 },
        ],
      },
      {
        id: 'nemo-happy',
        youtubeVideoId: '2zLkasScy7A',
        movieTitle: 'Finding Nemo',
        startTime: 11,
        endTime: 26,
        lines: [
          { speaker: 'Speaker', text: "It's so pretty.", lineStartTime: 14.3, lineEndTime: 16.3 },
          { speaker: 'Speaker', text: "I'm feeling happy, which is a big deal for me.", lineStartTime: 16.9, lineEndTime: 21.2 },
          { speaker: 'Speaker', text: 'Hey, come back.', lineStartTime: 24.7, lineEndTime: 25.4 },
        ],
      },
      {
        id: 'frozen-melting',
        youtubeVideoId: 'TbQm5doF_Uc',
        movieTitle: 'Frozen',
        startTime: 118,
        endTime: 124,
        lines: [
          { speaker: 'Speaker', text: "Oh, you're melting.", lineStartTime: 118.1, lineEndTime: 119.2 },
          { speaker: 'Speaker', text: 'Some people are worth melting for.', lineStartTime: 119.3, lineEndTime: 121.1 },
        ],
      },
    ],
  },
];
