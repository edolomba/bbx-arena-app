# BBX Arena: come metterlo online

Questo è il sito completo: registrazione e login, profili con statistiche, battle a turni e live, voti e ranking.
Servono tre servizi gratuiti: **GitHub** (il codice), **Supabase** (database, account, file audio) e **Vercel** (il sito).

## 1. Supabase: il database

1. Vai su supabase.com, accedi e crea un nuovo progetto (**New project**).
   Scegli una password per il database (salvala) e una regione vicina, per esempio Frankfurt.
2. Quando il progetto è pronto, apri **SQL Editor**, crea una nuova query, incolla **tutto** il contenuto di
   `supabase/migrations/0001_init.sql` e premi **Run**. Deve finire con "Success".
   Se compare un errore su `pg_cron`, attiva l'estensione **pg_cron** dalla sezione Database → Extensions e riesegui lo script.
3. Copia due valori dalle impostazioni API del progetto (Project Settings → API, oppure il pulsante **Connect**):
   - **Project URL**, tipo `https://abcdefgh.supabase.co`
   - la chiave pubblica: **anon public** oppure **publishable key**. Mai la "service_role" o "secret".

## 2. GitHub: il codice

1. Crea un nuovo repository, per esempio `bbx-arena-app`, pubblico o privato.
2. Clicca **uploading an existing file** e trascina **il contenuto** di questa cartella
   (le cartelle `app`, `components`, `hooks`, `lib`, `supabase` e tutti i file). Poi **Commit changes**.

## 3. Vercel: il sito

1. **Add New → Project**, importa `bbx-arena-app`. Il preset deve essere **Next.js**.
2. Apri **Environment Variables** e aggiungi:
   - `NEXT_PUBLIC_SUPABASE_URL` = il Project URL
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = la chiave pubblica
3. **Deploy**.

## 4. Collega gli account al tuo indirizzo

In Supabase, sezione **Authentication → URL Configuration**:
- **Site URL**: il tuo indirizzo Vercel, per esempio `https://bbx-arena-app.vercel.app`
- **Redirect URLs**: aggiungi `https://bbx-arena-app.vercel.app/**`

Senza questo passaggio i link di conferma email porterebbero a una pagina sbagliata.

## Note

- Le email di conferma del piano gratuito di Supabase sono limitate a poche all'ora. Per i primi test puoi
  disattivare la conferma email nelle impostazioni del provider Email (Authentication).
- Una persona può votare 24 ore dopo la registrazione (anti-spam). Per provare il voto subito, crea tre account
  e aspetta un giorno, oppure riduci il limite nella funzione `cast_vote`.
- Per aggiornare il sito: carica i file modificati su GitHub; Vercel ripubblica da solo.
