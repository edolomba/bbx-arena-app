/**
 * The founder's story, shown at the bottom of the home page and at /story.
 * Written in English on purpose (the author's choice); the labels around it are translated.
 * Inline **bold** is supported.
 */
export const STORY = {
  author: 'static',
  date: '2026-10-22',
  tags: ['origin', 'vision'],
  title: 'Beatbox found me twice. The second time, I built it a home.',
  /** Shown on the home page card. */
  excerpt: [
    'I was ten when I first heard beatbox. A YouTube video, a sound I couldn’t believe was coming from a human mouth, and right after it, me trying to copy the basics.',
    'Then life moved on. Back then there weren’t many videos to learn from, and little by little I left beatbox behind. For years.',
  ],
  /** The rest of the story, after the excerpt. */
  body: [
    'At the start of 2026, YouTube recommended a video I wasn’t looking for: **Wing – Dopamine**. I pressed play and sat there in shock. Beatbox had evolved into something I barely recognized. That same week I started training again.',
    'I began following every tournament and every battle I could find. And I noticed something: there was no shortage of battles. Online platforms, Discord servers, in-person events. But they were never easy to find. You had to join the right server, know the right crew, follow the right organization. If you weren’t already inside, you missed it.',
    'So I asked myself a simple question: **why isn’t all of this in one place?**',
    'That question became Beatbox Arena.',
    'My hope is that it becomes a reference point for the community. Not only for beatboxers, but for the organizers who keep this scene alive: a space where they can run their events and promote their own work.',
    'If you’re reading this, you’re here from the start. Welcome to the arena.',
  ],
};

export const storyMinutes = () => Math.max(1, Math.round([...STORY.excerpt, ...STORY.body].join(' ').split(/\s+/).length / 200));
