// Learning/source language of the content a request is asking for. The app
// teaches English ('en', the original corpus) and Spanish ('es', the new
// track) to Turkish speakers; the native/translation language stays Turkish
// either way, so this only selects WHICH source-language content to serve.
//
// Read from the `?lang=` query param. Anything missing or unrecognized falls
// back to 'en', which keeps every existing client (that sends no param) on the
// exact behavior it had before the language dimension existed.

export type Lang = 'en' | 'es';

const SUPPORTED: readonly Lang[] = ['en', 'es'];

export function parseLang(req: Request): Lang {
  try {
    const v = new URL(req.url).searchParams.get('lang');
    return SUPPORTED.includes(v as Lang) ? (v as Lang) : 'en';
  } catch {
    return 'en';
  }
}
