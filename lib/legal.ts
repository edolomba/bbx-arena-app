import type { Locale } from '@/lib/i18n/config';

/**
 * Terms of use and privacy policy, in every language.
 * Inline markup: **bold**, [link text](/path), {contact} = the contact address.
 * These are a starting point: have a lawyer review them before a public launch.
 */
export type LegalBlock = { h?: string; p?: string; ul?: string[] };
export type LegalDoc = { title: string; updatedLabel: string; updated: string; blocks: LegalBlock[] };

const UPDATED = '2026-10-21';

export const CONTACT_FALLBACK: Record<Locale, string> = {
  en: 'the contact address shown in the site footer',
  pt: 'o endereço de contato no rodapé do site',
  es: 'la dirección de contacto que aparece al pie de la web',
  it: 'l’indirizzo di contatto in fondo al sito',
  fr: 'l’adresse de contact indiquée en bas du site',
};

export const TERMS: Record<Locale, LegalDoc> = {
  en: {
    title: 'Terms of use', updatedLabel: 'Last updated', updated: UPDATED,
    blocks: [
      { p: 'These terms apply to everyone who uses BBX Arena. By creating an account you agree to them.' },
      { h: 'Who can use BBX Arena', p: 'You must be at least 16 years old. One account per person. You’re responsible for what happens on your account, so keep your password to yourself.' },
      { h: 'Your recordings and live performances', ul: [
        'You keep the rights to everything you record, upload or perform live.',
        'You give BBX Arena permission to store, stream, replay and display your recordings, live performances, waveforms and results on the platform, including after a battle or event ends, so they stay listenable for voters, judges and opponents.',
        'Only perform and submit audio you made yourself. No copied rounds, and no music or samples you don’t have the rights to.',
      ] },
      { h: 'Fair play', ul: [
        'No fake accounts, vote trading, coordinated voting or anything else that games votes, ratings, points or badges.',
        'Judges and hosts judge honestly and don’t compete in what they judge or host.',
        'No hate speech, harassment, threats or sexual content, in audio or text.',
        'Votes, judges’ decisions, results and your public profile are visible to everyone.',
      ] },
      { h: 'Events', p: 'Hosts run their events and are responsible for running them fairly. Ranked events award ranking points only after a moderator approves them. Moderators can change an event to Casual if it doesn’t meet the rules.' },
      { h: 'Moderation', p: 'Anyone can report a battle or a profile. Moderators can hide battles and suspend or remove accounts that break these terms. Ratings, points and badges have no monetary value and can be corrected if they were gained unfairly.' },
      { h: 'Deleting your account', p: 'You can delete your account at any time in [your settings](/settings). Your profile and recordings are removed; your opponents keep their results against an anonymous player.' },
      { h: 'The service', p: 'BBX Arena is provided as it is. We work to keep it running and your recordings safe, but can’t promise it will always be available or free of errors, especially live audio, which depends on everyone’s connection.' },
      { h: 'Changes', p: 'If these terms change in a way that matters, we’ll say so on the site before the change applies.' },
      { h: 'Language', p: 'These terms are available in several languages. If the versions differ, the English version applies.' },
      { h: 'Contact', p: 'Questions about these terms: {contact}.' },
    ],
  },
  pt: {
    title: 'Termos de uso', updatedLabel: 'Última atualização', updated: UPDATED,
    blocks: [
      { p: 'Estes termos valem para todos que usam o BBX Arena. Ao criar uma conta, você concorda com eles.' },
      { h: 'Quem pode usar o BBX Arena', p: 'Você precisa ter pelo menos 16 anos. Uma conta por pessoa. Você é responsável pelo que acontece na sua conta, então não compartilhe sua senha.' },
      { h: 'Suas gravações e apresentações ao vivo', ul: [
        'Os direitos de tudo o que você grava, envia ou apresenta ao vivo continuam sendo seus.',
        'Você autoriza o BBX Arena a guardar, transmitir, reproduzir e exibir suas gravações, apresentações ao vivo, formas de onda e resultados na plataforma, inclusive depois que a batalha ou o evento termina, para que continuem disponíveis para quem vota, para os juízes e para os adversários.',
        'Apresente e envie apenas áudio feito por você. Nada de rounds copiados, nem músicas ou samples sobre os quais você não tem direitos.',
      ] },
      { h: 'Jogo limpo', ul: [
        'Nada de contas falsas, troca de votos, votação combinada ou qualquer coisa que manipule votos, rating, pontos ou selos.',
        'Juízes e hosts julgam com honestidade e não competem no que julgam ou organizam.',
        'Nada de discurso de ódio, assédio, ameaças ou conteúdo sexual, em áudio ou texto.',
        'Votos, decisões dos juízes, resultados e seu perfil público são visíveis para todos.',
      ] },
      { h: 'Eventos', p: 'Os hosts conduzem seus eventos e são responsáveis por conduzi-los de forma justa. Eventos Ranked só dão pontos no ranking depois de aprovados pela moderação. A moderação pode transformar um evento em Casual se ele não cumprir as regras.' },
      { h: 'Moderação', p: 'Qualquer pessoa pode denunciar uma batalha ou um perfil. Moderadores podem ocultar batalhas e suspender ou remover contas que desrespeitem estes termos. Rating, pontos e selos não têm valor em dinheiro e podem ser corrigidos se foram obtidos de forma injusta.' },
      { h: 'Excluir sua conta', p: 'Você pode excluir sua conta a qualquer momento nas [suas configurações](/settings). Seu perfil e suas gravações são apagados; seus adversários mantêm os resultados contra um jogador anônimo.' },
      { h: 'O serviço', p: 'O BBX Arena é oferecido como está. Trabalhamos para mantê-lo no ar e suas gravações seguras, mas não podemos garantir que estará sempre disponível ou livre de erros, principalmente o áudio ao vivo, que depende da conexão de todos.' },
      { h: 'Alterações', p: 'Se estes termos mudarem de forma relevante, avisaremos no site antes de a mudança valer.' },
      { h: 'Idioma', p: 'Estes termos estão disponíveis em vários idiomas. Se as versões forem diferentes, vale a versão em inglês.' },
      { h: 'Contato', p: 'Dúvidas sobre estes termos: {contact}.' },
    ],
  },
  es: {
    title: 'Términos de uso', updatedLabel: 'Última actualización', updated: UPDATED,
    blocks: [
      { p: 'Estos términos se aplican a todas las personas que usan BBX Arena. Al crear una cuenta los aceptas.' },
      { h: 'Quién puede usar BBX Arena', p: 'Debes tener al menos 16 años. Una cuenta por persona. Eres responsable de lo que pase en tu cuenta, así que no compartas tu contraseña.' },
      { h: 'Tus grabaciones y actuaciones en directo', ul: [
        'Conservas los derechos de todo lo que grabas, subes o interpretas en directo.',
        'Autorizas a BBX Arena a guardar, transmitir, reproducir y mostrar tus grabaciones, actuaciones en directo, formas de onda y resultados en la plataforma, también después de que termine una batalla o un evento, para que sigan disponibles para quienes votan, los jueces y los rivales.',
        'Interpreta y envía solo audio hecho por ti. Nada de rondas copiadas ni de música o samples sobre los que no tengas derechos.',
      ] },
      { h: 'Juego limpio', ul: [
        'Nada de cuentas falsas, intercambio de votos, votaciones coordinadas ni nada que manipule votos, rating, puntos o insignias.',
        'Los jueces y los hosts juzgan con honestidad y no compiten en lo que juzgan u organizan.',
        'Nada de discurso de odio, acoso, amenazas ni contenido sexual, en audio o en texto.',
        'Los votos, las decisiones de los jueces, los resultados y tu perfil público son visibles para todos.',
      ] },
      { h: 'Eventos', p: 'Los hosts dirigen sus eventos y son responsables de que sean justos. Los eventos Ranked solo dan puntos de ranking cuando la moderación los aprueba. La moderación puede pasar un evento a Casual si no cumple las normas.' },
      { h: 'Moderación', p: 'Cualquiera puede denunciar una batalla o un perfil. La moderación puede ocultar batallas y suspender o eliminar cuentas que incumplan estos términos. El rating, los puntos y las insignias no tienen valor económico y pueden corregirse si se obtuvieron de forma injusta.' },
      { h: 'Eliminar tu cuenta', p: 'Puedes eliminar tu cuenta cuando quieras en [tus ajustes](/settings). Tu perfil y tus grabaciones se borran; tus rivales conservan sus resultados frente a un jugador anónimo.' },
      { h: 'El servicio', p: 'BBX Arena se ofrece tal cual. Trabajamos para mantenerlo en marcha y tus grabaciones a salvo, pero no podemos garantizar que esté siempre disponible ni libre de errores, sobre todo el audio en directo, que depende de la conexión de todos.' },
      { h: 'Cambios', p: 'Si estos términos cambian de forma relevante, lo avisaremos en la web antes de que el cambio se aplique.' },
      { h: 'Idioma', p: 'Estos términos están disponibles en varios idiomas. Si las versiones difieren, se aplica la versión en inglés.' },
      { h: 'Contacto', p: 'Preguntas sobre estos términos: {contact}.' },
    ],
  },
  it: {
    title: 'Termini d’uso', updatedLabel: 'Ultimo aggiornamento', updated: UPDATED,
    blocks: [
      { p: 'Questi termini valgono per tutti quelli che usano BBX Arena. Creando un account li accetti.' },
      { h: 'Chi può usare BBX Arena', p: 'Devi avere almeno 16 anni. Un account per persona. Sei responsabile di quello che succede sul tuo account, quindi tieni la password per te.' },
      { h: 'Le tue registrazioni e le esibizioni dal vivo', ul: [
        'I diritti su tutto quello che registri, carichi o esegui dal vivo restano tuoi.',
        'Autorizzi BBX Arena a conservare, trasmettere, riprodurre e mostrare le tue registrazioni, esibizioni dal vivo, forme d’onda e risultati sulla piattaforma, anche dopo la fine di una battle o di un evento, così restano ascoltabili per chi vota, per i giudici e per gli avversari.',
        'Esegui e invia solo audio fatto da te. Niente round copiati, né musica o sample su cui non hai i diritti.',
      ] },
      { h: 'Fair play', ul: [
        'Niente account falsi, scambi di voti, voti coordinati o qualsiasi cosa che manipoli voti, rating, punti o badge.',
        'Giudici e host giudicano in modo onesto e non gareggiano in ciò che giudicano od organizzano.',
        'Niente incitamento all’odio, molestie, minacce o contenuti sessuali, né in audio né per iscritto.',
        'Voti, decisioni dei giudici, risultati e il tuo profilo pubblico sono visibili a tutti.',
      ] },
      { h: 'Eventi', p: 'Gli host gestiscono i propri eventi e sono responsabili di gestirli in modo corretto. Gli eventi Ranked danno punti in classifica solo dopo l’approvazione della moderazione. La moderazione può trasformare un evento in Casual se non rispetta le regole.' },
      { h: 'Moderazione', p: 'Chiunque può segnalare una battle o un profilo. I moderatori possono nascondere battle e sospendere o rimuovere account che violano questi termini. Rating, punti e badge non hanno valore economico e possono essere corretti se ottenuti in modo scorretto.' },
      { h: 'Eliminare il tuo account', p: 'Puoi eliminare il tuo account in qualsiasi momento nelle [tue impostazioni](/settings). Il tuo profilo e le tue registrazioni vengono cancellati; i tuoi avversari mantengono i risultati contro un giocatore anonimo.' },
      { h: 'Il servizio', p: 'BBX Arena è fornito così com’è. Lavoriamo per tenerlo attivo e le tue registrazioni al sicuro, ma non possiamo garantire che sia sempre disponibile o privo di errori, soprattutto l’audio dal vivo, che dipende dalla connessione di tutti.' },
      { h: 'Modifiche', p: 'Se questi termini cambiano in modo rilevante, lo diremo sul sito prima che la modifica entri in vigore.' },
      { h: 'Lingua', p: 'Questi termini sono disponibili in più lingue. Se le versioni sono diverse, vale la versione in inglese.' },
      { h: 'Contatti', p: 'Domande su questi termini: {contact}.' },
    ],
  },
  fr: {
    title: 'Conditions d’utilisation', updatedLabel: 'Dernière mise à jour', updated: UPDATED,
    blocks: [
      { p: 'Ces conditions s’appliquent à toutes les personnes qui utilisent BBX Arena. En créant un compte, tu les acceptes.' },
      { h: 'Qui peut utiliser BBX Arena', p: 'Tu dois avoir au moins 16 ans. Un compte par personne. Tu es responsable de ce qui se passe sur ton compte, alors garde ton mot de passe pour toi.' },
      { h: 'Tes enregistrements et tes passages en direct', ul: [
        'Tu gardes les droits sur tout ce que tu enregistres, envoies ou interprètes en direct.',
        'Tu autorises BBX Arena à conserver, diffuser, rejouer et afficher tes enregistrements, passages en direct, formes d’onde et résultats sur la plateforme, y compris après la fin d’une battle ou d’un événement, pour qu’ils restent écoutables par les votants, les juges et les adversaires.',
        'N’interprète et n’envoie que du son que tu as fait toi-même. Pas de rounds copiés, ni de musique ou de samples sur lesquels tu n’as pas de droits.',
      ] },
      { h: 'Fair-play', ul: [
        'Pas de faux comptes, d’échange de votes, de votes coordonnés ni de quoi que ce soit qui fausse les votes, le rating, les points ou les badges.',
        'Les juges et les hosts jugent honnêtement et ne participent pas à ce qu’ils jugent ou organisent.',
        'Pas de discours haineux, de harcèlement, de menaces ni de contenu sexuel, en audio comme à l’écrit.',
        'Les votes, les décisions des juges, les résultats et ton profil public sont visibles par tous.',
      ] },
      { h: 'Événements', p: 'Les hosts gèrent leurs événements et sont responsables de leur bon déroulement. Les événements Ranked ne rapportent des points au classement qu’après validation par la modération. La modération peut passer un événement en Casual s’il ne respecte pas les règles.' },
      { h: 'Modération', p: 'Tout le monde peut signaler une battle ou un profil. Les modérateurs peuvent masquer des battles et suspendre ou supprimer les comptes qui enfreignent ces conditions. Le rating, les points et les badges n’ont aucune valeur monétaire et peuvent être corrigés s’ils ont été obtenus de façon déloyale.' },
      { h: 'Supprimer ton compte', p: 'Tu peux supprimer ton compte à tout moment dans [tes réglages](/settings). Ton profil et tes enregistrements sont effacés ; tes adversaires gardent leurs résultats face à un joueur anonyme.' },
      { h: 'Le service', p: 'BBX Arena est fourni tel quel. Nous faisons en sorte qu’il fonctionne et que tes enregistrements soient en sécurité, mais nous ne pouvons pas garantir qu’il sera toujours disponible ou sans erreur, surtout l’audio en direct, qui dépend de la connexion de chacun.' },
      { h: 'Modifications', p: 'Si ces conditions changent de façon importante, nous le signalerons sur le site avant que le changement s’applique.' },
      { h: 'Langue', p: 'Ces conditions existent en plusieurs langues. En cas de différence entre les versions, la version anglaise fait foi.' },
      { h: 'Contact', p: 'Questions sur ces conditions : {contact}.' },
    ],
  },
};

export const PRIVACY: Record<Locale, LegalDoc> = {
  en: {
    title: 'Privacy policy', updatedLabel: 'Last updated', updated: UPDATED,
    blocks: [
      { p: 'This page explains what BBX Arena stores about you, why, and how to remove it. It is written to meet the GDPR (Europe) and the LGPD (Brazil).' },
      { h: 'What we store', ul: [
        '**Account:** your email address and a hashed password.',
        '**Public profile:** handle, and optionally your name, country, bio and links.',
        '**Recordings:** the audio you record or upload for battles and events, plus measurements of it (waveform, loudness, sub-bass share).',
        '**Activity:** battles, events you host, judge or enter, results, rankings and scores, ratings, points, badges, the votes you cast and the reports you send.',
        '**Settings:** your language, and the devices where you turned on notifications.',
        '**Notifications:** messages about your battles and events.',
      ] },
      { h: 'Live audio', p: 'In Stage battles, events and the mic check, your microphone is sent live to the people in the room through LiveKit. LiveKit relays the sound in real time and doesn’t keep it; the replay you see later is recorded on your own device and uploaded to BBX Arena.' },
      { h: 'What is public', p: 'Your profile, battles, recordings, results, ratings, points, badges, votes and judges’ decisions are visible to everyone. That’s how judging stays transparent. A judge’s ranking in an event stays private until the host publishes the classification. Your email address is never shown.' },
      { h: 'Why', p: 'To run your account, battles and events, show results and rankings, keep voting and judging fair, send you the notifications you asked for, and moderate abuse. We don’t sell your data, and there are no ads or tracking cookies. The only cookies are the ones that keep you logged in and remember your language.' },
      { h: 'Who processes it', ul: [
        '**Supabase:** database, logins and audio storage (servers in the United States).',
        '**Vercel:** hosts the website.',
        '**LiveKit:** carries live audio in real time; nothing is stored.',
        '**Your browser’s push service** (Google, Apple or Mozilla, depending on your browser): delivers notifications to the devices where you turned them on.',
      ] },
      { h: 'How long', p: 'For as long as your account exists. When you delete your account, your profile details, recordings and notification settings are deleted; battle and event results stay, shown against an anonymous player, so other people’s records stay correct.' },
      { h: 'Your rights', p: 'You can see and edit your profile in [your settings](/settings), turn notifications off there, and delete your account at any time. For a copy of your data or any other request, write to {contact}.' },
      { h: 'Age', p: 'BBX Arena is for people aged 16 and over.' },
      { h: 'Language', p: 'This policy is available in several languages. If the versions differ, the English version applies.' },
    ],
  },
  pt: {
    title: 'Política de privacidade', updatedLabel: 'Última atualização', updated: UPDATED,
    blocks: [
      { p: 'Esta página explica o que o BBX Arena guarda sobre você, por quê e como apagar. Ela foi escrita para atender ao GDPR (Europa) e à LGPD (Brasil).' },
      { h: 'O que guardamos', ul: [
        '**Conta:** seu email e uma senha criptografada.',
        '**Perfil público:** nome de usuário e, se você quiser, nome, país, bio e links.',
        '**Gravações:** o áudio que você grava ou envia em batalhas e eventos, mais medições dele (forma de onda, volume, parte de sub-grave).',
        '**Atividade:** batalhas, eventos que você organiza, julga ou disputa, resultados, classificações e notas, rating, pontos, selos, os votos que você dá e as denúncias que envia.',
        '**Configurações:** seu idioma e os aparelhos em que você ativou notificações.',
        '**Notificações:** mensagens sobre suas batalhas e eventos.',
      ] },
      { h: 'Áudio ao vivo', p: 'Nas batalhas de palco, nos eventos e no teste de microfone, seu microfone é enviado ao vivo para as pessoas da sala através do LiveKit. O LiveKit retransmite o som em tempo real e não o guarda; o replay que aparece depois é gravado no seu próprio aparelho e enviado ao BBX Arena.' },
      { h: 'O que é público', p: 'Seu perfil, batalhas, gravações, resultados, rating, pontos, selos, votos e decisões dos juízes são visíveis para todos. É assim que o julgamento fica transparente. A classificação de um juiz num evento fica privada até o host publicar o resultado. Seu email nunca aparece.' },
      { h: 'Por quê', p: 'Para manter sua conta, suas batalhas e eventos, mostrar resultados e rankings, manter votos e julgamentos justos, enviar as notificações que você pediu e moderar abusos. Não vendemos seus dados, e não há anúncios nem cookies de rastreamento. Os únicos cookies são os que mantêm você logado e lembram seu idioma.' },
      { h: 'Quem processa', ul: [
        '**Supabase:** banco de dados, logins e armazenamento de áudio (servidores nos Estados Unidos).',
        '**Vercel:** hospeda o site.',
        '**LiveKit:** transmite o áudio ao vivo em tempo real; nada é guardado.',
        '**O serviço de push do seu navegador** (Google, Apple ou Mozilla, conforme o navegador): entrega as notificações nos aparelhos em que você as ativou.',
      ] },
      { h: 'Por quanto tempo', p: 'Enquanto sua conta existir. Quando você exclui a conta, seus dados de perfil, gravações e configurações de notificação são apagados; os resultados de batalhas e eventos continuam, contra um jogador anônimo, para que o histórico das outras pessoas fique correto.' },
      { h: 'Seus direitos', p: 'Você pode ver e editar seu perfil nas [suas configurações](/settings), desligar as notificações lá e excluir sua conta a qualquer momento. Para uma cópia dos seus dados ou qualquer outro pedido, escreva para {contact}.' },
      { h: 'Idade', p: 'O BBX Arena é para pessoas a partir de 16 anos.' },
      { h: 'Idioma', p: 'Esta política está disponível em vários idiomas. Se as versões forem diferentes, vale a versão em inglês.' },
    ],
  },
  es: {
    title: 'Política de privacidad', updatedLabel: 'Última actualización', updated: UPDATED,
    blocks: [
      { p: 'Esta página explica qué guarda BBX Arena sobre ti, por qué y cómo borrarlo. Está redactada para cumplir el RGPD (Europa) y la LGPD (Brasil).' },
      { h: 'Qué guardamos', ul: [
        '**Cuenta:** tu email y una contraseña cifrada.',
        '**Perfil público:** nombre de usuario y, si quieres, nombre, país, bio y enlaces.',
        '**Grabaciones:** el audio que grabas o subes en batallas y eventos, y sus mediciones (forma de onda, sonoridad, proporción de subgraves).',
        '**Actividad:** batallas, eventos que organizas, juzgas o disputas, resultados, clasificaciones y notas, rating, puntos, insignias, los votos que emites y las denuncias que envías.',
        '**Ajustes:** tu idioma y los dispositivos donde activaste las notificaciones.',
        '**Notificaciones:** mensajes sobre tus batallas y eventos.',
      ] },
      { h: 'Audio en directo', p: 'En las batallas de escenario, los eventos y la prueba de micrófono, tu micro se envía en directo a las personas de la sala a través de LiveKit. LiveKit retransmite el sonido en tiempo real y no lo guarda; la repetición que ves después se graba en tu propio dispositivo y se sube a BBX Arena.' },
      { h: 'Qué es público', p: 'Tu perfil, batallas, grabaciones, resultados, rating, puntos, insignias, votos y decisiones de los jueces son visibles para todos. Así el juicio es transparente. La clasificación de un juez en un evento es privada hasta que el host publica el resultado. Tu email nunca se muestra.' },
      { h: 'Por qué', p: 'Para gestionar tu cuenta, tus batallas y eventos, mostrar resultados y rankings, mantener justas las votaciones y el juicio, enviarte las notificaciones que pediste y moderar abusos. No vendemos tus datos, y no hay anuncios ni cookies de seguimiento. Las únicas cookies son las que mantienen tu sesión y recuerdan tu idioma.' },
      { h: 'Quién los trata', ul: [
        '**Supabase:** base de datos, inicios de sesión y almacenamiento de audio (servidores en Estados Unidos).',
        '**Vercel:** aloja la web.',
        '**LiveKit:** transmite el audio en directo en tiempo real; no se guarda nada.',
        '**El servicio push de tu navegador** (Google, Apple o Mozilla, según el navegador): entrega las notificaciones en los dispositivos donde las activaste.',
      ] },
      { h: 'Durante cuánto tiempo', p: 'Mientras exista tu cuenta. Cuando la eliminas, se borran tus datos de perfil, tus grabaciones y tus ajustes de notificaciones; los resultados de batallas y eventos se mantienen, frente a un jugador anónimo, para que el historial de los demás siga siendo correcto.' },
      { h: 'Tus derechos', p: 'Puedes ver y editar tu perfil en [tus ajustes](/settings), desactivar allí las notificaciones y eliminar tu cuenta cuando quieras. Para una copia de tus datos o cualquier otra solicitud, escribe a {contact}.' },
      { h: 'Edad', p: 'BBX Arena es para personas a partir de 16 años.' },
      { h: 'Idioma', p: 'Esta política está disponible en varios idiomas. Si las versiones difieren, se aplica la versión en inglés.' },
    ],
  },
  it: {
    title: 'Informativa sulla privacy', updatedLabel: 'Ultimo aggiornamento', updated: UPDATED,
    blocks: [
      { p: 'Questa pagina spiega cosa conserva BBX Arena su di te, perché e come cancellarlo. È scritta per rispettare il GDPR (Europa) e la LGPD (Brasile).' },
      { h: 'Cosa conserviamo', ul: [
        '**Account:** il tuo indirizzo email e una password cifrata.',
        '**Profilo pubblico:** nome utente e, se vuoi, nome, paese, bio e link.',
        '**Registrazioni:** l’audio che registri o carichi per battle ed eventi, più le sue misurazioni (forma d’onda, loudness, quota di sub-bassi).',
        '**Attività:** battle, eventi che organizzi, giudichi o a cui partecipi, risultati, classifiche e voti di giuria, rating, punti, badge, i voti che dai e le segnalazioni che invii.',
        '**Impostazioni:** la tua lingua e i dispositivi su cui hai attivato le notifiche.',
        '**Notifiche:** messaggi sulle tue battle e sui tuoi eventi.',
      ] },
      { h: 'Audio dal vivo', p: 'Nelle battle sul palco, negli eventi e nel test del microfono, il tuo microfono viene inviato dal vivo alle persone nella stanza tramite LiveKit. LiveKit ritrasmette il suono in tempo reale e non lo conserva; il replay che vedi dopo viene registrato sul tuo dispositivo e caricato su BBX Arena.' },
      { h: 'Cosa è pubblico', p: 'Il tuo profilo, le battle, le registrazioni, i risultati, il rating, i punti, i badge, i voti e le decisioni dei giudici sono visibili a tutti. È così che il giudizio resta trasparente. La classifica di un giudice in un evento resta privata finché l’host non pubblica il risultato. Il tuo indirizzo email non viene mai mostrato.' },
      { h: 'Perché', p: 'Per gestire il tuo account, le tue battle e i tuoi eventi, mostrare risultati e classifiche, mantenere corretti voti e giudizi, inviarti le notifiche che hai chiesto e moderare gli abusi. Non vendiamo i tuoi dati, e non ci sono pubblicità né cookie di tracciamento. Gli unici cookie sono quelli che ti tengono connesso e ricordano la tua lingua.' },
      { h: 'Chi li tratta', ul: [
        '**Supabase:** database, accessi e archiviazione dell’audio (server negli Stati Uniti).',
        '**Vercel:** ospita il sito.',
        '**LiveKit:** trasmette l’audio dal vivo in tempo reale; non conserva niente.',
        '**Il servizio push del tuo browser** (Google, Apple o Mozilla, a seconda del browser): consegna le notifiche sui dispositivi su cui le hai attivate.',
      ] },
      { h: 'Per quanto tempo', p: 'Finché esiste il tuo account. Quando lo elimini, vengono cancellati i dati del profilo, le registrazioni e le impostazioni delle notifiche; i risultati di battle ed eventi restano, contro un giocatore anonimo, così lo storico degli altri resta corretto.' },
      { h: 'I tuoi diritti', p: 'Puoi vedere e modificare il tuo profilo nelle [tue impostazioni](/settings), disattivare lì le notifiche ed eliminare il tuo account in qualsiasi momento. Per una copia dei tuoi dati o qualsiasi altra richiesta, scrivi a {contact}.' },
      { h: 'Età', p: 'BBX Arena è per persone dai 16 anni in su.' },
      { h: 'Lingua', p: 'Questa informativa è disponibile in più lingue. Se le versioni sono diverse, vale la versione in inglese.' },
    ],
  },
  fr: {
    title: 'Politique de confidentialité', updatedLabel: 'Dernière mise à jour', updated: UPDATED,
    blocks: [
      { p: 'Cette page explique ce que BBX Arena conserve sur toi, pourquoi, et comment le supprimer. Elle est rédigée pour respecter le RGPD (Europe) et la LGPD (Brésil).' },
      { h: 'Ce que nous conservons', ul: [
        '**Compte :** ton adresse email et un mot de passe chiffré.',
        '**Profil public :** ton pseudo et, si tu veux, ton nom, ton pays, ta bio et tes liens.',
        '**Enregistrements :** le son que tu enregistres ou envoies pour les battles et les événements, et ses mesures (forme d’onde, loudness, part de sub-basses).',
        '**Activité :** battles, événements que tu organises, juges ou disputes, résultats, classements et notes, rating, points, badges, les votes que tu donnes et les signalements que tu envoies.',
        '**Réglages :** ta langue et les appareils sur lesquels tu as activé les notifications.',
        '**Notifications :** messages sur tes battles et tes événements.',
      ] },
      { h: 'Audio en direct', p: 'Dans les battles sur scène, les événements et le test du micro, ton micro est envoyé en direct aux personnes de la salle via LiveKit. LiveKit relaie le son en temps réel et ne le conserve pas ; le replay que tu vois ensuite est enregistré sur ton propre appareil et envoyé à BBX Arena.' },
      { h: 'Ce qui est public', p: 'Ton profil, tes battles, enregistrements, résultats, rating, points, badges, votes et les décisions des juges sont visibles par tous. C’est ce qui rend le jugement transparent. Le classement d’un juge dans un événement reste privé jusqu’à ce que le host publie le résultat. Ton adresse email n’est jamais affichée.' },
      { h: 'Pourquoi', p: 'Pour faire fonctionner ton compte, tes battles et tes événements, afficher les résultats et les classements, garder les votes et le jugement équitables, t’envoyer les notifications que tu as demandées et modérer les abus. Nous ne vendons pas tes données, et il n’y a ni publicité ni cookies de suivi. Les seuls cookies sont ceux qui te gardent connecté et retiennent ta langue.' },
      { h: 'Qui les traite', ul: [
        '**Supabase :** base de données, connexions et stockage audio (serveurs aux États-Unis).',
        '**Vercel :** héberge le site.',
        '**LiveKit :** transporte l’audio en direct en temps réel ; rien n’est conservé.',
        '**Le service push de ton navigateur** (Google, Apple ou Mozilla, selon le navigateur) : livre les notifications sur les appareils où tu les as activées.',
      ] },
      { h: 'Combien de temps', p: 'Tant que ton compte existe. Quand tu le supprimes, tes données de profil, tes enregistrements et tes réglages de notification sont effacés ; les résultats des battles et des événements restent, face à un joueur anonyme, pour que l’historique des autres reste juste.' },
      { h: 'Tes droits', p: 'Tu peux voir et modifier ton profil dans [tes réglages](/settings), y couper les notifications et supprimer ton compte à tout moment. Pour une copie de tes données ou toute autre demande, écris à {contact}.' },
      { h: 'Âge', p: 'BBX Arena est réservé aux personnes de 16 ans et plus.' },
      { h: 'Langue', p: 'Cette politique existe en plusieurs langues. En cas de différence entre les versions, la version anglaise fait foi.' },
    ],
  },
};
