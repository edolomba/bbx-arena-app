import type { MetadataRoute } from 'next';

/** Lets people add BBX Arena to their home screen (required for push on iPhone). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BBX Arena',
    short_name: 'BBX Arena',
    description: '1v1 beatbox battles in real studio quality.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0a0d',
    theme_color: '#0a0a0d',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
