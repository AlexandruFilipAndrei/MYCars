# MYCars

MYCars este o aplicație web pentru administrarea unei flote auto.

Prin aplicație poți gestiona:

- mașini
- închirieri
- reparații
- documente auto
- alerte pentru documente care expiră
- acces partajat pentru alți utilizatori

## Acces aplicație

Aplicația este publicată online prin Vercel.

Link aplicație:

`adauga-aici-linkul-vercel`

## Tehnologii folosite

- React
- TypeScript
- Vite
- Tailwind CSS
- Supabase

## Rulare locală

1. Instalează dependențele:

```bash
npm install
```

2. Creează fișierul `.env` pe baza `.env.example`

3. Pornește aplicația:

```bash
npm run dev
```

## Build

```bash
npm run build
```

## Observații

- Modul demo nu salvează date în baza de date reală
- Pentru producție sunt necesare variabilele `VITE_SUPABASE_URL` și `VITE_SUPABASE_ANON_KEY`
