// Video block values that authors paste, shared by the embed helper tests and the CSP test
// (every iframe origin the helper produces must be allowed by frame-src in public/_headers).

// Every shape YouTube hands out for the video dQw4w9WgXcQ.
export const YOUTUBE_VIDEO_LINKS = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch?feature=share&v=dQw4w9WgXcQ',
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=90s',
  'https://m.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://music.youtube.com/watch?v=dQw4w9WgXcQ&list=RDdQw4w9WgXcQ',
  'https://WWW.YOUTUBE.COM/watch?v=dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ',
  'https://youtu.be/dQw4w9WgXcQ?si=Ab12Cd34',
  'https://youtube.com/shorts/dQw4w9WgXcQ?si=Ab12Cd34',
  'https://www.youtube.com/shorts/dQw4w9WgXcQ/',
  'https://www.youtube.com/live/dQw4w9WgXcQ?feature=share',
  'https://www.youtube.com/embed/dQw4w9WgXcQ',
  'https://www.youtube.com/v/dQw4w9WgXcQ',
  'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0',
  '<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?si=x" allowfullscreen></iframe>',
  '<iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ"></iframe>',
];

export const CLIPY_VIDEO_LINKS = [
  'https://clipy.online/video/tizg5pl1gkul',
  '<iframe src="https://clipy.online/embed/tizg5pl1gkul?autoplay=1" allowfullscreen></iframe>',
];
