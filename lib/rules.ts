import type { Locale } from '@/lib/i18n/config';

/**
 * "Rules & guide": how every part of Beatbox Arena works, and the community rules.
 * Inline **bold** and [link](/path) are supported. Keep it in sync with the site.
 */
export type Block = { id: string; icon: string; title: string; text?: string[]; do?: string[]; dont?: string[] };
export type RulesDoc = {
  title: string; lead: string; toc: string; guide: string; rules: string; doLabel: string; dontLabel: string;
  guideBlocks: Block[]; ruleBlocks: Block[]; outro: string;
};

export const RULES: Record<Locale, RulesDoc> = {
  en: {
    title: 'Rules & guide',
    lead: 'Everything you need to battle, vote and run events on Beatbox Arena, and the few rules that keep the arena fair and friendly.',
    toc: 'On this page', guide: 'How it works', rules: 'Community rules', doLabel: 'Do', dontLabel: 'Don’t',
    guideBlocks: [
      { id: 'account', icon: '👤', title: 'Your account and profile', text: [
        'Sign up with an email, a handle and (optionally) your country. You must be 16 or older.',
        'In [Settings](/settings) add a **profile photo**, your bio and links, and turn on **notifications** for your phone or computer.',
        'Before your first battle, run the [mic check](/mic-check): it checks your levels, bass and highs, and whether your connection can carry a live round.',
        'Pick your language at the bottom of any page.',
      ] },
      { id: 'battles', icon: '🔥', title: 'Battles', text: [
        'Go to **Start a battle**, choose a format and either **challenge a beatboxer** (by @handle) or post an **open challenge** that anyone can take. Open challenges appear under **Take the challenge** on the home page and the battles page.',
        '**Take turns:** your opponent has 24 hours to accept, then each of you has 24 hours to record your turn. The one answering hears the other’s round first, just like a real battle. You can record your **opening round right away** when you challenge: when they accept, it’s straight their turn.',
        '**Live premiere:** you both record before a set time, and the rounds premiere together for everyone in the room. A round that isn’t in before the start counts as a forfeit.',
        '**Stage, real time:** mic to mic, live. A host starts each round and the voting; 3 or 5 judges vote right after, or the audience votes if there are no judges. If you host your own battle, it’s Casual (no rating, no points). The host, the judges and the battlers can talk between rounds like in a voice channel; during a round only the battler on stage is heard. The host can mute people, invite someone from the audience to speak, and remove or ban people from the room.',
      ] },
      { id: 'voting', icon: '🗳️', title: 'Voting', text: [
        'Anyone with an account can vote on battles they’re not part of. To unlock your vote you have to **listen to at least half of every round**.',
        'Votes are **public** and tied to your profile. Vote for the better performance, not for your friend.',
        'Use **Match loudness** so nobody wins just by being louder.',
      ] },
      { id: 'results', icon: '🏆', title: 'Results, rating and badges', text: [
        'When voting closes, the majority wins. Every Ranked result moves your **rating** (Elo): beating someone rated above you counts more.',
        'Battles also give **ranking points** for the week, the season and all time. The exact values are on the [ranking page](/ranking).',
        'If you miss a deadline, you lose by **forfeit**. Casual battles don’t touch rating or points.',
        '**Badges** arrive automatically: first battle, win streaks, upsets, tournament podiums and more. Your rarest one shows next to your name.',
      ] },
      { id: 'tagteam', icon: '👥', title: 'Tag Team (2v2)', text: [
        'A **fixed Tag Team** has a name, its own page, rating and ranking: create it in [Tag Teams](/teams) and your partner accepts. You can be in up to 3.',
        'In **Start a battle → Tag Team 2v2** pick your Tag Team or a **casual duo** (your partner’s @, or an **open seat** anyone can take), and challenge a Tag Team or post an open challenge. The battle starts when all four seats are taken.',
        '**Recorded battles:** one of you records the first part; the other puts headphones on and **records over it**. The site compensates the device delay, you can listen to the mix and fine-tune the timing; the mix is your team’s round.',
        '**On stage:** in your team’s round both mics are open. Each of you records your own mic in full quality and the site mixes the two for the replay. For parts performed exactly together, being in the same room works best.',
        'Results move the rating of all four members and of fixed Tag Teams. In events, Tag Team categories take fixed Tag Teams only, and both members get the full tournament points.',
      ] },
      { id: 'events', icon: '🎪', title: 'Events and tournaments', text: [
        'Anyone can [create an event](/events/new): logo, name, edition, dates, description and a **schedule** shown in every visitor’s local time.',
        'Each event has one or more **categories** (Open, Junior, Tag team…). Each category has its own registrations, judges and bracket, and says **who can take part**.',
        '**Eliminations:** registered beatboxers perform a live showcase; each judge ranks everyone privately. The official classification drops each beatboxer’s best and worst position and adds up the rest.',
        'The top beatboxers go to a **knockout** (with small final and final), **Swiss rounds** or **7 to Smoke**. Hosts and judges can’t compete in their own category.',
        'Casual events are open to everyone. **Ranked** events give ranking points to the top 8, after a moderator approves them.',
      ] },
      { id: 'help', icon: '💬', title: 'Notifications and feedback', text: [
        'The bell at the top shows challenges, your turns, results and event updates. With notifications turned on, they also reach your phone when the site is closed.',
        'Found a problem or have an idea? Send it from the [feedback page](/feedback). We read everything.',
      ] },
    ],
    ruleBlocks: [
      { id: 'respect', icon: '🤝', title: 'Respect',
        do: ['Battle hard, talk kind. Trash talk belongs in the round, and only there.', 'Treat hosts, judges and voters the way you’d want to be treated.'],
        dont: ['Insults, harassment, threats or bullying, in audio or text.', 'Hate speech or content attacking anyone for who they are.', 'Sexual or violent content.'] },
      { id: 'real', icon: '🪪', title: 'Be real',
        do: ['One account per person, with your own name or artist name.'],
        dont: ['Fake profiles, second accounts or pretending to be another beatboxer.', 'Sharing your account with someone else.'] },
      { id: 'audio', icon: '🎤', title: 'Your sound, your work',
        do: ['Submit and perform only audio that **you** made, recorded for that battle or event.'],
        dont: ['Rounds recorded by someone else, copied from videos, or stolen from other battles.', 'Music, samples or recordings you don’t have the rights to.'] },
      { id: 'fair', icon: '⚖️', title: 'Fair play',
        do: ['Vote for the performance you actually think was better.', 'As a judge, judge honestly; as a host, run the event fairly.'],
        dont: ['Trading votes, asking for votes in groups, or voting with extra accounts.', 'Fake events or fake battles to farm points or badges.', 'Abusing bugs: report them instead.'] },
      { id: 'reports', icon: '🚩', title: 'Reports and consequences', text: [
        'Use **Report** on any battle or profile. Moderators review every report.',
        'Depending on what happened, moderators can hide a battle, correct ratings, points or badges gained unfairly, **suspend** an account, or remove it for good.',
        'A suspended account can still browse, but can’t battle, vote or create events. If you think it’s a mistake, write to us through the [feedback page](/feedback).',
      ] },
    ],
    outro: 'These rules sit alongside the [Terms of use](/terms) and the [Privacy policy](/privacy). Welcome to the arena.',
  },

  pt: {
    title: 'Regras e guia',
    lead: 'Tudo o que você precisa para batalhar, votar e organizar eventos no Beatbox Arena, e as poucas regras que mantêm a arena justa e amigável.',
    toc: 'Nesta página', guide: 'Como funciona', rules: 'Regras da comunidade', doLabel: 'Faça', dontLabel: 'Não faça',
    guideBlocks: [
      { id: 'account', icon: '👤', title: 'Sua conta e seu perfil', text: [
        'Cadastre-se com email, nome de usuário e (se quiser) seu país. É preciso ter 16 anos ou mais.',
        'Em [Configurações](/settings), coloque uma **foto de perfil**, sua bio e seus links, e ative as **notificações** no celular ou no computador.',
        'Antes da primeira batalha, faça o [teste de microfone](/mic-check): ele confere o volume, os graves e os agudos, e se a sua conexão aguenta um round ao vivo.',
        'Escolha o idioma no rodapé de qualquer página.',
      ] },
      { id: 'battles', icon: '🔥', title: 'Batalhas', text: [
        'Vá em **Criar batalha**, escolha o formato e **desafie um beatboxer** (pelo @usuário) ou publique um **desafio aberto**, que qualquer pessoa pode aceitar. Os desafios abertos aparecem em **Aceite o desafio**, na home e na página de batalhas.',
        '**Por turnos:** a outra pessoa tem 24 horas para aceitar e, depois, cada um tem 24 horas para gravar a sua vez. Quem responde ouve o round do outro antes, como numa batalha de verdade. Você pode **gravar seu round de abertura** já ao desafiar: quando aceitarem, a batalha começa direto na vez da outra pessoa.',
        '**Estreia ao vivo:** os dois gravam antes de um horário marcado, e os rounds estreiam juntos para todos na sala. Round que não chegar antes do início conta como W.O.',
        '**Palco, ao vivo:** mic contra mic, em tempo real. Um host inicia cada round e a votação; 3 ou 5 juízes votam logo depois, ou o público vota se não houver juízes. Se você for host da sua própria batalha, ela é Casual (sem rating e sem pontos). Host, juízes e battlers podem conversar entre os rounds, como num canal de voz; durante o round, só o battler no palco é ouvido. O host pode mutar pessoas, convidar alguém do público para falar e expulsar ou banir da sala.',
      ] },
      { id: 'voting', icon: '🗳️', title: 'Votação', text: [
        'Qualquer pessoa com conta pode votar nas batalhas de que não participa. Para liberar o voto, é preciso **ouvir pelo menos metade de cada round**.',
        'Os votos são **públicos** e ficam ligados ao seu perfil. Vote na melhor apresentação, não no seu amigo.',
        'Use **Igualar volume** para ninguém ganhar só por estar mais alto.',
      ] },
      { id: 'results', icon: '🏆', title: 'Resultados, rating e selos', text: [
        'Quando a votação fecha, vence a maioria. Cada resultado Ranked mexe no seu **rating** (Elo): vencer alguém acima de você vale mais.',
        'As batalhas também dão **pontos no ranking** da semana, da temporada e geral. Os valores exatos estão na [página do ranking](/ranking).',
        'Se perder um prazo, você perde por **W.O.** Batalhas Casual não mexem em rating nem pontos.',
        'Os **selos** chegam sozinhos: primeira batalha, sequências de vitórias, zebras, pódios em torneios e mais. O mais raro aparece ao lado do seu nome.',
      ] },
      { id: 'tagteam', icon: '👥', title: 'Tag Team (2v2)', text: [
        'Um **Tag Team fixo** tem nome, página, rating e ranking próprios: crie em [Tag Teams](/teams), e sua dupla aceita. Você pode estar em até 3.',
        'Em **Criar batalha → Tag Team 2v2**, escolha seu Tag Team ou uma **dupla casual** (o @ do parceiro, ou uma **vaga aberta** para qualquer um), e desafie um Tag Team ou publique um desafio aberto. A batalha começa quando os quatro lugares estão ocupados.',
        '**Batalhas gravadas:** um de vocês grava a primeira parte; o outro coloca o fone e **grava por cima**. O site compensa o atraso do aparelho, deixa ouvir a mistura e ajustar o encaixe; a mistura é o round da dupla.',
        '**No palco:** no round da dupla, os dois microfones ficam abertos. Cada um grava o próprio microfone em qualidade máxima, e o site junta os dois para o replay. Para partes feitas exatamente juntas, estar no mesmo lugar funciona melhor.',
        'Os resultados mexem no rating dos quatro integrantes e dos Tag Teams fixos. Nos eventos, as categorias Tag Team aceitam só Tag Teams fixos, e os dois integrantes recebem os pontos inteiros do torneio.',
      ] },
      { id: 'events', icon: '🎪', title: 'Eventos e torneios', text: [
        'Qualquer pessoa pode [criar um evento](/events/new): logo, nome, edição, datas, descrição e uma **programação** mostrada no horário local de cada visitante.',
        'Cada evento tem uma ou mais **categorias** (Open, Junior, Tag team…). Cada categoria tem inscrições, juízes e chave próprios, e diz **quem pode participar**.',
        '**Eliminatórias:** os inscritos fazem um showcase ao vivo, e cada juiz classifica todos em segredo. A classificação oficial descarta a melhor e a pior posição de cada beatboxer e soma o resto.',
        'Os melhores vão para o **mata-mata** (com small final e final), as **rodadas suíças** ou o **7 to Smoke**. Hosts e juízes não podem competir na própria categoria.',
        'Eventos Casual são abertos a todos. Eventos **Ranked** dão pontos no ranking ao top 8, depois de aprovados pela moderação.',
      ] },
      { id: 'help', icon: '💬', title: 'Notificações e feedback', text: [
        'O sininho no topo mostra desafios, suas vezes, resultados e novidades dos eventos. Com as notificações ativas, elas chegam ao seu celular mesmo com o site fechado.',
        'Encontrou um problema ou tem uma ideia? Mande pela [página de feedback](/feedback). Lemos tudo.',
      ] },
    ],
    ruleBlocks: [
      { id: 'respect', icon: '🤝', title: 'Respeito',
        do: ['Batalhe com tudo e fale com educação. A provocação fica no round, e só nele.', 'Trate hosts, juízes e quem vota como você gostaria de ser tratado.'],
        dont: ['Ofensas, assédio, ameaças ou bullying, em áudio ou texto.', 'Discurso de ódio ou ataques a alguém pelo que a pessoa é.', 'Conteúdo sexual ou violento.'] },
      { id: 'real', icon: '🪪', title: 'Seja você',
        do: ['Uma conta por pessoa, com seu nome ou nome artístico.'],
        dont: ['Perfis falsos, segundas contas ou fingir ser outro beatboxer.', 'Emprestar sua conta para outra pessoa.'] },
      { id: 'audio', icon: '🎤', title: 'Seu som, seu trabalho',
        do: ['Envie e apresente só áudio feito por **você**, gravado para aquela batalha ou aquele evento.'],
        dont: ['Rounds gravados por outra pessoa, copiados de vídeos ou roubados de outras batalhas.', 'Músicas, samples ou gravações sobre as quais você não tem direitos.'] },
      { id: 'fair', icon: '⚖️', title: 'Jogo limpo',
        do: ['Vote na apresentação que você realmente achou melhor.', 'Como juiz, julgue com honestidade; como host, conduza o evento de forma justa.'],
        dont: ['Trocar votos, pedir votos em grupo ou votar com outras contas.', 'Eventos ou batalhas falsos para ganhar pontos ou selos.', 'Aproveitar falhas do site: denuncie em vez de usar.'] },
      { id: 'reports', icon: '🚩', title: 'Denúncias e consequências', text: [
        'Use **Denunciar** em qualquer batalha ou perfil. A moderação analisa todas as denúncias.',
        'Conforme o caso, a moderação pode ocultar uma batalha, corrigir rating, pontos ou selos obtidos de forma injusta, **suspender** uma conta ou removê-la de vez.',
        'Uma conta suspensa continua navegando, mas não batalha, não vota e não cria eventos. Se achar que foi um engano, escreva pela [página de feedback](/feedback).',
      ] },
    ],
    outro: 'Estas regras complementam os [Termos de uso](/terms) e a [Política de privacidade](/privacy). Bem-vindo à arena.',
  },

  es: {
    title: 'Reglas y guía',
    lead: 'Todo lo que necesitas para batallar, votar y organizar eventos en Beatbox Arena, y las pocas reglas que mantienen la arena justa y amable.',
    toc: 'En esta página', guide: 'Cómo funciona', rules: 'Reglas de la comunidad', doLabel: 'Sí', dontLabel: 'No',
    guideBlocks: [
      { id: 'account', icon: '👤', title: 'Tu cuenta y tu perfil', text: [
        'Regístrate con email, nombre de usuario y (si quieres) tu país. Debes tener 16 años o más.',
        'En [Ajustes](/settings) añade una **foto de perfil**, tu bio y tus enlaces, y activa las **notificaciones** en el móvil o el ordenador.',
        'Antes de tu primera batalla, haz la [prueba de micrófono](/mic-check): revisa el volumen, los graves y los agudos, y si tu conexión aguanta una ronda en directo.',
        'Elige el idioma al pie de cualquier página.',
      ] },
      { id: 'battles', icon: '🔥', title: 'Batallas', text: [
        'Ve a **Crear batalla**, elige el formato y **desafía a un beatboxer** (por su @usuario) o publica un **desafío abierto** que cualquiera puede aceptar. Los desafíos abiertos aparecen en **Acepta el desafío**, en el inicio y en la página de batallas.',
        '**Por turnos:** tu rival tiene 24 horas para aceptar y después cada uno tiene 24 horas para grabar su turno. Quien responde escucha antes la ronda del otro, como en una batalla de verdad. Puedes **grabar tu ronda de apertura** al desafiar: cuando acepten, la batalla empieza directamente en su turno.',
        '**Estreno en directo:** los dos graban antes de una hora fijada y las rondas se estrenan a la vez para toda la sala. Una ronda que no llegue antes del inicio cuenta como incomparecencia.',
        '**Escenario, en directo:** micro contra micro, en tiempo real. Un host inicia cada ronda y la votación; 3 o 5 jueces votan justo después, o vota el público si no hay jueces. Si eres host de tu propia batalla, es Casual (sin rating ni puntos). El host, los jueces y los battlers pueden hablar entre rondas, como en un canal de voz; durante la ronda solo se oye al battler en el escenario. El host puede silenciar, invitar a alguien del público a hablar y expulsar o vetar en la sala.',
      ] },
      { id: 'voting', icon: '🗳️', title: 'Votación', text: [
        'Cualquiera con cuenta puede votar en las batallas en las que no participa. Para desbloquear el voto hay que **escuchar al menos la mitad de cada ronda**.',
        'Los votos son **públicos** y van ligados a tu perfil. Vota a la mejor actuación, no a tu amigo.',
        'Usa **Igualar volumen** para que nadie gane solo por sonar más fuerte.',
      ] },
      { id: 'results', icon: '🏆', title: 'Resultados, rating e insignias', text: [
        'Cuando cierra la votación, gana la mayoría. Cada resultado Ranked mueve tu **rating** (Elo): ganar a alguien por encima de ti cuenta más.',
        'Las batallas también dan **puntos de ranking** de la semana, la temporada y el histórico. Los valores exactos están en la [página del ranking](/ranking).',
        'Si se te pasa un plazo, pierdes por **incomparecencia**. Las batallas Casual no afectan al rating ni a los puntos.',
        'Las **insignias** llegan solas: primera batalla, rachas, sorpresas, podios en torneos y más. La más rara aparece junto a tu nombre.',
      ] },
      { id: 'tagteam', icon: '👥', title: 'Tag Team (2v2)', text: [
        'Un **Tag Team fijo** tiene nombre, página, rating y ranking propios: créalo en [Tag Teams](/teams) y tu pareja acepta. Puedes estar en hasta 3.',
        'En **Crear batalla → Tag Team 2v2** elige tu Tag Team o un **dúo casual** (el @ de tu pareja, o una **plaza abierta** para cualquiera), y desafía a un Tag Team o publica un desafío abierto. La batalla empieza cuando las cuatro plazas están ocupadas.',
        '**Batallas grabadas:** uno de vosotros graba la primera parte; el otro se pone los auriculares y **graba encima**. La web compensa el retardo del dispositivo, deja escuchar la mezcla y ajustar el encaje; la mezcla es la ronda del dúo.',
        '**En el escenario:** en la ronda del dúo, los dos micros están abiertos. Cada uno graba su micro en máxima calidad y la web junta los dos para la repetición. Para partes hechas exactamente juntas, estar en el mismo sitio funciona mejor.',
        'Los resultados mueven el rating de los cuatro integrantes y de los Tag Teams fijos. En los eventos, las categorías Tag Team solo aceptan Tag Teams fijos, y los dos integrantes reciben los puntos completos del torneo.',
      ] },
      { id: 'events', icon: '🎪', title: 'Eventos y torneos', text: [
        'Cualquiera puede [crear un evento](/events/new): logo, nombre, edición, fechas, descripción y un **programa** mostrado en la hora local de cada visitante.',
        'Cada evento tiene una o más **categorías** (Open, Junior, Tag team…). Cada categoría tiene sus inscripciones, jueces y cuadro, e indica **quién puede participar**.',
        '**Eliminatorias:** los inscritos hacen un showcase en directo y cada juez los clasifica a todos en secreto. La clasificación oficial descarta la mejor y la peor posición de cada beatboxer y suma el resto.',
        'Los mejores pasan a **eliminación directa** (con final menor y final), **rondas suizas** o **7 to Smoke**. Hosts y jueces no pueden competir en su propia categoría.',
        'Los eventos Casual están abiertos a todos. Los eventos **Ranked** dan puntos de ranking al top 8, tras la aprobación de la moderación.',
      ] },
      { id: 'help', icon: '💬', title: 'Notificaciones y comentarios', text: [
        'La campana de arriba muestra desafíos, tus turnos, resultados y novedades de eventos. Con las notificaciones activadas, llegan a tu móvil aunque la web esté cerrada.',
        '¿Has encontrado un problema o tienes una idea? Envíalo desde la [página de comentarios](/feedback). Lo leemos todo.',
      ] },
    ],
    ruleBlocks: [
      { id: 'respect', icon: '🤝', title: 'Respeto',
        do: ['Batalla a tope y habla con respeto. La provocación va en la ronda, y solo ahí.', 'Trata a hosts, jueces y votantes como te gustaría que te trataran.'],
        dont: ['Insultos, acoso, amenazas o bullying, en audio o texto.', 'Discurso de odio o ataques a alguien por quién es.', 'Contenido sexual o violento.'] },
      { id: 'real', icon: '🪪', title: 'Sé tú',
        do: ['Una cuenta por persona, con tu nombre o nombre artístico.'],
        dont: ['Perfiles falsos, segundas cuentas o hacerte pasar por otro beatboxer.', 'Prestar tu cuenta a otra persona.'] },
      { id: 'audio', icon: '🎤', title: 'Tu sonido, tu trabajo',
        do: ['Envía y actúa solo con audio hecho por **ti**, grabado para esa batalla o ese evento.'],
        dont: ['Rondas grabadas por otra persona, copiadas de vídeos o robadas de otras batallas.', 'Música, samples o grabaciones sobre los que no tienes derechos.'] },
      { id: 'fair', icon: '⚖️', title: 'Juego limpio',
        do: ['Vota a la actuación que de verdad te pareció mejor.', 'Como juez, juzga con honestidad; como host, dirige el evento con justicia.'],
        dont: ['Intercambiar votos, pedir votos en grupo o votar con otras cuentas.', 'Eventos o batallas falsos para conseguir puntos o insignias.', 'Aprovechar fallos de la web: repórtalos en lugar de usarlos.'] },
      { id: 'reports', icon: '🚩', title: 'Denuncias y consecuencias', text: [
        'Usa **Denunciar** en cualquier batalla o perfil. La moderación revisa todas las denuncias.',
        'Según el caso, la moderación puede ocultar una batalla, corregir rating, puntos o insignias obtenidos de forma injusta, **suspender** una cuenta o eliminarla.',
        'Una cuenta suspendida puede navegar, pero no batallar, votar ni crear eventos. Si crees que es un error, escríbenos desde la [página de comentarios](/feedback).',
      ] },
    ],
    outro: 'Estas reglas complementan los [Términos de uso](/terms) y la [Política de privacidad](/privacy). Bienvenido a la arena.',
  },

  it: {
    title: 'Regole e guida',
    lead: 'Tutto quello che ti serve per fare battle, votare e organizzare eventi su Beatbox Arena, e le poche regole che tengono l’arena giusta e amichevole.',
    toc: 'In questa pagina', guide: 'Come funziona', rules: 'Regole della community', doLabel: 'Sì', dontLabel: 'No',
    guideBlocks: [
      { id: 'account', icon: '👤', title: 'Il tuo account e il tuo profilo', text: [
        'Iscriviti con email, nome utente e (se vuoi) il tuo paese. Devi avere almeno 16 anni.',
        'Nelle [Impostazioni](/settings) aggiungi una **foto profilo**, la bio e i tuoi link, e attiva le **notifiche** su telefono o computer.',
        'Prima della tua prima battle fai il [test del microfono](/mic-check): controlla i livelli, i bassi e gli alti, e se la connessione regge un round dal vivo.',
        'Scegli la lingua in fondo a qualsiasi pagina.',
      ] },
      { id: 'battles', icon: '🔥', title: 'Battle', text: [
        'Vai su **Crea una battle**, scegli il formato e **sfida un beatboxer** (con il suo @utente) oppure pubblica una **sfida aperta** che chiunque può accettare. Le sfide aperte compaiono in **Accetta la sfida**, in home e nella pagina delle battle.',
        '**A turni:** l’avversario ha 24 ore per accettare, poi ognuno ha 24 ore per registrare il proprio turno. Chi risponde ascolta prima il round dell’altro, come in una battle vera. Puoi **registrare il tuo round di apertura** già quando sfidi: quando accettano, la battle parte subito dal loro turno.',
        '**Prima dal vivo:** registrate entrambi prima di un orario fissato, e i round vanno in onda insieme per tutta la stanza. Un round che non arriva prima dell’inizio vale come sconfitta a tavolino.',
        '**Palco, dal vivo:** mic contro mic, in tempo reale. Un host avvia ogni round e il voto; 3 o 5 giudici votano subito dopo, oppure vota il pubblico se non ci sono giudici. Se fai da host alla tua battle, è Casual (niente rating né punti). Host, giudici e battler possono parlare tra un round e l’altro, come in un canale vocale; durante il round si sente solo il battler sul palco. L’host può silenziare, invitare qualcuno del pubblico a parlare ed espellere o bannare dalla stanza.',
      ] },
      { id: 'voting', icon: '🗳️', title: 'Voto', text: [
        'Chiunque abbia un account può votare le battle a cui non partecipa. Per sbloccare il voto devi **ascoltare almeno metà di ogni round**.',
        'I voti sono **pubblici** e legati al tuo profilo. Vota la performance migliore, non il tuo amico.',
        'Usa **Pareggia il volume** così nessuno vince solo perché suona più forte.',
      ] },
      { id: 'results', icon: '🏆', title: 'Risultati, rating e badge', text: [
        'Quando il voto chiude, vince la maggioranza. Ogni risultato Ranked muove il tuo **rating** (Elo): battere chi sta sopra di te vale di più.',
        'Le battle danno anche **punti in classifica** della settimana, della stagione e di sempre. I valori esatti sono nella [pagina della classifica](/ranking).',
        'Se manchi una scadenza, perdi **a tavolino**. Le battle Casual non toccano rating né punti.',
        'I **badge** arrivano da soli: prima battle, serie di vittorie, sorprese, podi nei tornei e altro. Il più raro compare accanto al tuo nome.',
      ] },
      { id: 'tagteam', icon: '👥', title: 'Tag Team (2v2)', text: [
        'Un **Tag Team fisso** ha nome, pagina, rating e classifica propri: crealo in [Tag Team](/teams) e il tuo partner accetta. Puoi essere in fino a 3.',
        'In **Crea una battle → Tag Team 2v2** scegli il tuo Tag Team o un **duo casual** (l’@ del partner, o un **posto libero** per chiunque), e sfida un Tag Team o pubblica una sfida aperta. La battle parte quando tutti e quattro i posti sono occupati.',
        '**Battle registrate:** uno di voi registra la prima parte; l’altro mette le cuffie e **registra sopra**. Il sito compensa il ritardo del dispositivo, fa ascoltare il mix e regolare l’incastro; il mix è il round del duo.',
        '**Sul palco:** nel round del duo i due microfoni sono aperti. Ognuno registra il proprio microfono in qualità piena e il sito unisce le due registrazioni per il replay. Per parti fatte esattamente insieme, stare nello stesso posto funziona meglio.',
        'I risultati muovono il rating dei quattro membri e dei Tag Team fissi. Negli eventi, le categorie Tag Team accettano solo Tag Team fissi, ed entrambi i membri ricevono i punti interi del torneo.',
      ] },
      { id: 'events', icon: '🎪', title: 'Eventi e tornei', text: [
        'Chiunque può [creare un evento](/events/new): logo, nome, edizione, date, descrizione e un **programma** mostrato nell’orario locale di ogni visitatore.',
        'Ogni evento ha una o più **categorie** (Open, Junior, Tag team…). Ogni categoria ha iscrizioni, giudici e tabellone propri, e indica **chi può partecipare**.',
        '**Eliminatorie:** gli iscritti fanno uno showcase dal vivo e ogni giudice li classifica tutti in segreto. La classifica ufficiale scarta la posizione migliore e la peggiore di ogni beatboxer e somma le altre.',
        'I migliori passano all’**eliminazione diretta** (con finalina e finale), ai **turni svizzeri** o al **7 to Smoke**. Host e giudici non possono gareggiare nella propria categoria.',
        'Gli eventi Casual sono aperti a tutti. Gli eventi **Ranked** danno punti in classifica alla top 8, dopo l’approvazione della moderazione.',
      ] },
      { id: 'help', icon: '💬', title: 'Notifiche e feedback', text: [
        'La campanella in alto mostra sfide, i tuoi turni, risultati e novità degli eventi. Con le notifiche attive, arrivano sul telefono anche a sito chiuso.',
        'Hai trovato un problema o hai un’idea? Mandala dalla [pagina dei feedback](/feedback). Leggiamo tutto.',
      ] },
    ],
    ruleBlocks: [
      { id: 'respect', icon: '🤝', title: 'Rispetto',
        do: ['Spingi forte nella battle e parla con rispetto. Le provocazioni stanno nel round, e solo lì.', 'Tratta host, giudici e chi vota come vorresti essere trattato.'],
        dont: ['Insulti, molestie, minacce o bullismo, in audio o per iscritto.', 'Incitamento all’odio o attacchi a qualcuno per quello che è.', 'Contenuti sessuali o violenti.'] },
      { id: 'real', icon: '🪪', title: 'Sii te stesso',
        do: ['Un account a persona, con il tuo nome o nome d’arte.'],
        dont: ['Profili falsi, secondi account o spacciarsi per un altro beatboxer.', 'Prestare il tuo account a qualcun altro.'] },
      { id: 'audio', icon: '🎤', title: 'Il tuo suono, il tuo lavoro',
        do: ['Invia ed esegui solo audio fatto da **te**, registrato per quella battle o quell’evento.'],
        dont: ['Round registrati da altri, copiati da video o rubati da altre battle.', 'Musica, sample o registrazioni su cui non hai i diritti.'] },
      { id: 'fair', icon: '⚖️', title: 'Fair play',
        do: ['Vota la performance che secondo te è stata davvero migliore.', 'Da giudice giudica onestamente; da host gestisci l’evento in modo corretto.'],
        dont: ['Scambiare voti, chiedere voti in gruppo o votare con altri account.', 'Eventi o battle falsi per ottenere punti o badge.', 'Sfruttare i bug del sito: segnalali invece di usarli.'] },
      { id: 'reports', icon: '🚩', title: 'Segnalazioni e conseguenze', text: [
        'Usa **Segnala** su qualsiasi battle o profilo. La moderazione esamina ogni segnalazione.',
        'A seconda dei casi, la moderazione può nascondere una battle, correggere rating, punti o badge ottenuti in modo scorretto, **sospendere** un account o rimuoverlo definitivamente.',
        'Un account sospeso può navigare, ma non fare battle, votare o creare eventi. Se pensi sia un errore, scrivici dalla [pagina dei feedback](/feedback).',
      ] },
    ],
    outro: 'Queste regole si affiancano ai [Termini d’uso](/terms) e all’[Informativa sulla privacy](/privacy). Benvenuto nell’arena.',
  },

  fr: {
    title: 'Règles et guide',
    lead: 'Tout ce qu’il faut pour battler, voter et organiser des événements sur Beatbox Arena, et les quelques règles qui gardent l’arène juste et conviviale.',
    toc: 'Sur cette page', guide: 'Comment ça marche', rules: 'Règles de la communauté', doLabel: 'À faire', dontLabel: 'À éviter',
    guideBlocks: [
      { id: 'account', icon: '👤', title: 'Ton compte et ton profil', text: [
        'Inscris-toi avec un email, un pseudo et (si tu veux) ton pays. Il faut avoir 16 ans ou plus.',
        'Dans les [Réglages](/settings), ajoute une **photo de profil**, ta bio et tes liens, et active les **notifications** sur ton téléphone ou ton ordinateur.',
        'Avant ta première battle, fais le [test du micro](/mic-check) : il vérifie ton niveau, les basses et les aigus, et si ta connexion tient un round en direct.',
        'Choisis ta langue en bas de n’importe quelle page.',
      ] },
      { id: 'battles', icon: '🔥', title: 'Battles', text: [
        'Va dans **Lancer une battle**, choisis le format et **défie un beatboxer** (par son @pseudo) ou publie un **défi ouvert** que n’importe qui peut relever. Les défis ouverts apparaissent dans **Relève le défi**, sur l’accueil et la page des battles.',
        '**Chacun son tour :** ton adversaire a 24 heures pour accepter, puis chacun a 24 heures pour enregistrer son tour. Celui qui répond écoute d’abord le round de l’autre, comme dans une vraie battle. Tu peux **enregistrer ton round d’ouverture** dès le défi : quand ton adversaire accepte, c’est directement à lui.',
        '**Première en direct :** vous enregistrez tous les deux avant une heure fixée, et les rounds sont diffusés ensemble pour toute la salle. Un round qui n’arrive pas avant le début compte comme un forfait.',
        '**Scène, en direct :** micro contre micro, en temps réel. Un host lance chaque round et le vote ; 3 ou 5 juges votent juste après, ou le public vote s’il n’y a pas de juges. Si tu es host de ta propre battle, elle est Casual (pas de rating ni de points). Le host, les juges et les battlers peuvent parler entre les rounds, comme dans un salon vocal ; pendant un round, seul le battler sur scène s’entend. Le host peut couper un micro, inviter quelqu’un du public à parler, et exclure ou bannir de la salle.',
      ] },
      { id: 'voting', icon: '🗳️', title: 'Vote', text: [
        'Toute personne inscrite peut voter pour les battles auxquelles elle ne participe pas. Pour débloquer ton vote, il faut **écouter au moins la moitié de chaque round**.',
        'Les votes sont **publics** et liés à ton profil. Vote pour la meilleure prestation, pas pour ton pote.',
        'Utilise **Égaliser le volume** pour que personne ne gagne juste parce qu’il est plus fort.',
      ] },
      { id: 'results', icon: '🏆', title: 'Résultats, rating et badges', text: [
        'Quand le vote ferme, la majorité l’emporte. Chaque résultat Ranked fait bouger ton **rating** (Elo) : battre plus fort que toi compte davantage.',
        'Les battles rapportent aussi des **points au classement** de la semaine, de la saison et de tous les temps. Les valeurs exactes sont sur la [page du classement](/ranking).',
        'Si tu rates un délai, tu perds **par forfait**. Les battles Casual ne touchent ni au rating ni aux points.',
        'Les **badges** arrivent tout seuls : première battle, séries de victoires, surprises, podiums en tournoi et plus. Le plus rare s’affiche à côté de ton nom.',
      ] },
      { id: 'tagteam', icon: '👥', title: 'Tag Team (2v2)', text: [
        'Un **Tag Team fixe** a son nom, sa page, son rating et son classement : crée-le dans [Tag Teams](/teams) et ton binôme accepte. Tu peux être dans 3 au maximum.',
        'Dans **Lancer une battle → Tag Team 2v2**, choisis ton Tag Team ou un **duo casual** (le @ de ton binôme, ou une **place libre** pour n’importe qui), puis défie un Tag Team ou publie un défi ouvert. La battle démarre quand les quatre places sont prises.',
        '**Battles enregistrées :** l’un de vous enregistre la première partie ; l’autre met son casque et **enregistre par-dessus**. Le site compense la latence de l’appareil, permet d’écouter le mix et de régler le calage ; le mix est le round du duo.',
        '**Sur scène :** pendant le round du duo, vos deux micros sont ouverts. Chacun enregistre son propre micro en pleine qualité et le site assemble les deux pour le replay. Pour des parties faites exactement ensemble, être au même endroit marche mieux.',
        'Les résultats font bouger le rating des quatre membres et des Tag Teams fixes. En événement, les catégories Tag Team n’acceptent que des Tag Teams fixes, et les deux membres reçoivent tous les points du tournoi.',
      ] },
      { id: 'events', icon: '🎪', title: 'Événements et tournois', text: [
        'Tout le monde peut [créer un événement](/events/new) : logo, nom, édition, dates, description et un **programme** affiché à l’heure locale de chaque visiteur.',
        'Chaque événement a une ou plusieurs **catégories** (Open, Junior, Tag team…). Chaque catégorie a ses inscriptions, ses juges et son tableau, et indique **qui peut participer**.',
        '**Éliminatoires :** les inscrits font un showcase en direct et chaque juge les classe tous en secret. Le classement officiel retire la meilleure et la pire position de chaque beatboxer et additionne le reste.',
        'Les meilleurs passent en **élimination directe** (avec petite finale et finale), en **rondes suisses** ou en **7 to Smoke**. Hosts et juges ne peuvent pas concourir dans leur propre catégorie.',
        'Les événements Casual sont ouverts à tous. Les événements **Ranked** rapportent des points au top 8, après validation par la modération.',
      ] },
      { id: 'help', icon: '💬', title: 'Notifications et retours', text: [
        'La cloche en haut affiche les défis, tes tours, les résultats et les nouvelles des événements. Avec les notifications activées, elles arrivent sur ton téléphone même site fermé.',
        'Tu as trouvé un problème ou tu as une idée ? Envoie-le depuis la [page des retours](/feedback). On lit tout.',
      ] },
    ],
    ruleBlocks: [
      { id: 'respect', icon: '🤝', title: 'Respect',
        do: ['Envoie tout dans la battle et reste correct. Les piques, c’est dans le round, et nulle part ailleurs.', 'Traite les hosts, les juges et les votants comme tu aimerais être traité.'],
        dont: ['Insultes, harcèlement, menaces ou intimidation, en audio comme à l’écrit.', 'Discours haineux ou attaques contre quelqu’un pour ce qu’il est.', 'Contenu sexuel ou violent.'] },
      { id: 'real', icon: '🪪', title: 'Sois toi-même',
        do: ['Un compte par personne, avec ton nom ou ton nom de scène.'],
        dont: ['Faux profils, comptes secondaires ou te faire passer pour un autre beatboxer.', 'Prêter ton compte à quelqu’un d’autre.'] },
      { id: 'audio', icon: '🎤', title: 'Ton son, ton travail',
        do: ['N’envoie et n’interprète que du son fait par **toi**, enregistré pour cette battle ou cet événement.'],
        dont: ['Des rounds enregistrés par quelqu’un d’autre, copiés de vidéos ou volés à d’autres battles.', 'De la musique, des samples ou des enregistrements sur lesquels tu n’as pas de droits.'] },
      { id: 'fair', icon: '⚖️', title: 'Fair-play',
        do: ['Vote pour la prestation que tu as vraiment trouvée meilleure.', 'Comme juge, juge honnêtement ; comme host, mène l’événement équitablement.'],
        dont: ['Échanger des votes, demander des votes en groupe ou voter avec d’autres comptes.', 'De faux événements ou de fausses battles pour gagner des points ou des badges.', 'Profiter des bugs du site : signale-les plutôt que de t’en servir.'] },
      { id: 'reports', icon: '🚩', title: 'Signalements et conséquences', text: [
        'Utilise **Signaler** sur n’importe quelle battle ou profil. La modération examine chaque signalement.',
        'Selon le cas, la modération peut masquer une battle, corriger un rating, des points ou des badges obtenus de façon déloyale, **suspendre** un compte ou le supprimer définitivement.',
        'Un compte suspendu peut naviguer, mais pas battler, voter ni créer d’événement. Si tu penses que c’est une erreur, écris-nous depuis la [page des retours](/feedback).',
      ] },
    ],
    outro: 'Ces règles complètent les [Conditions d’utilisation](/terms) et la [Politique de confidentialité](/privacy). Bienvenue dans l’arène.',
  },
};
