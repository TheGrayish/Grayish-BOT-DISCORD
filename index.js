const config = require('./config.json');
const express = require('express');
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, EmbedBuilder } = require('discord.js');
const { DisTube } = require('distube');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { SpotifyPlugin } = require('@distube/spotify');
const { YouTubePlugin } = require('@distube/youtube');
const { getVoiceConnection, joinVoiceChannel, createAudioPlayer, createAudioResource } = require('@discordjs/voice');
const ytdl = require('@distube/ytdl-core');
require('dotenv').config();

const app = express();
const port = 3000;
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildVoiceStates],
    partials: [Partials.Channel],
});

const distube = new DisTube(client, {
    plugins: [new YouTubePlugin(), new SpotifyPlugin(), new SoundCloudPlugin()]
});
const queue = new Map();
let controlMessage;
const currentQueuePage = new Map();

app.use(express.static('public'));

// Ruta para ejecutar el bot
app.get('/start-bot', (req, res) => {
    exec('node index.js', (err, stdout, stderr) => {
        if (err) {
            console.error(`Error ejecutando el bot: ${err}`);
            res.status(500).send('Error al iniciar el bot.');
            return;
        }
        console.log(`Bot iniciado: ${stdout}`);
        res.send('Bot iniciado correctamente.');
    });
});

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});

// Función para paginar la cola de canciones
function paginateQueue(queue, page = 0, pageSize = 10) {
    const totalPages = Math.ceil(queue.length / pageSize);
    const start = page * pageSize;
    const end = start + pageSize;
    const paginatedSongs = queue.slice(start, end);
    return {
        songs: paginatedSongs,
        page,
        totalPages
    };
}

client.once('ready', () => {
    console.log("El Bot está encendido");
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const responses = {
        hola: "Picate la cola mejor",
        valo: "@everyone Saquen el valo",
        fort: "@everyone Saquen el fortnite",
        chupi: "@everyone HOY SE BEBE, PREPARENSE PARA EL CHUPI",
        cs: "@everyone Saca el counter"
    };
    if (responses[message.content]) {
        return message.reply({ content: responses[message.content] });
    }

    if (message.content.startsWith('-play') || message.content.startsWith('-p')) {
        const args = message.content.split(' ');
        const query = args.slice(1).join(' ');
        if (!query) return message.reply('Proporciona un enlace o nombre de una canción.');

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('¡Debes estar en un canal de voz para reproducir música!');

        try {
            await distube.play(voiceChannel, query, {
                textChannel: message.channel,
                member: message.member,
            });
        } catch (err) {
            console.error('Error al intentar reproducir el audio:', err);
            message.reply("Hubo un error al intentar reproducir la canción.");
        }
    } else if (message.content === '-shuffle') {
        const queue = distube.getQueue(message.guild.id);
        if (!queue) return message.reply('No hay canciones en la cola para mezclar.');

        queue.shuffle();
        message.reply('🔀 La cola ha sido mezclada.');
    }
});

distube.on('playSong', async (queue, song) => {
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('pause')
                .setLabel('⏸️ Pausar')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('resume')
                .setLabel('▶️ Reanudar')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('skip')
                .setLabel('⏭️ Saltar')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('showQueue')
                .setLabel('🎵 Mostrar Cola')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('stop')
                .setLabel('⏹️ Detener')
                .setStyle(ButtonStyle.Danger)
        );

    if (controlMessage) await controlMessage.delete();
    controlMessage = await queue.textChannel.send({
        content: `🎶 Reproduciendo ahora: **${song.name}** - \`${song.formattedDuration}\``,
        components: [buttons]
    });
});

distube.on('addSong', (queue, song) => {
    queue.textChannel.send({
        content: `✅ Se ha añadido a la cola: **${song.name}** - \`${song.formattedDuration}\``
    });
});

distube.on('error', (channel, error) => {
    console.error('Error en DisTube:', error);
    if (channel) channel.send("Hubo un error durante la reproducción.");
});

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    const queue = distube.getQueue(interaction.guildId);
    const botVoiceChannel = interaction.guild.members.me.voice.channel;
    const userVoiceChannel = interaction.member.voice.channel;

    if (!userVoiceChannel || botVoiceChannel !== userVoiceChannel) {
        return interaction.reply({ content: '¡Debes estar en el mismo canal de voz que el bot para usar los controles!', ephemeral: true });
    }
    if (!queue && interaction.customId !== 'stop' && interaction.customId !== 'showQueue') {
        return interaction.reply({ content: 'No hay canciones en la cola.', ephemeral: true });
    }

    try {
        let page = currentQueuePage.get(interaction.guildId) || 0;

        switch (interaction.customId) {
            case 'pause':
                queue.pause();
                await interaction.reply('⏸️ La canción ha sido pausada.');
                break;
            case 'resume':
                queue.resume();
                await interaction.reply('▶️ La canción ha sido reanudada.');
                break;
            case 'skip':
                queue.skip();
                await interaction.reply('⏭️ Canción saltada.');
                break;
            case 'showQueue':
                const paginatedQueue = paginateQueue(queue.songs, page, 10);
                const queueEmbed = new EmbedBuilder()
                    .setColor(0x3498db)
                    .setTitle('🎵 Cola de canciones')
                    .setDescription(paginatedQueue.songs.map((song, i) => `**${page * 10 + i + 1}.** 🎶 **${song.name}** - \`${song.formattedDuration}\``).join('\n'))
                    .setFooter({ text: `Página ${page + 1} de ${paginatedQueue.totalPages}` });

                const paginationButtons = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId('prevPage')
                            .setLabel('⬅️ Anterior')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page === 0),
                        new ButtonBuilder()
                            .setCustomId('nextPage')
                            .setLabel('➡️ Siguiente')
                            .setStyle(ButtonStyle.Primary)
                            .setDisabled(page === paginatedQueue.totalPages - 1)
                    );

                await interaction.reply({ embeds: [queueEmbed], components: [paginationButtons], ephemeral: true });
                break;
            case 'stop':
                queue.stop();
                const voiceConnection = getVoiceConnection(interaction.guildId);
                if (voiceConnection) voiceConnection.destroy();
                await interaction.reply('⏹️ La reproducción ha sido detenida y el bot ha salido del canal de voz.');
                if (controlMessage) await controlMessage.delete();
                break;
        }
    } catch (error) {
        if (error.code !== 'InteractionAlreadyReplied') {
            console.error('Error en la interacción de botón:', error);
            await interaction.reply({ content: 'Hubo un error al procesar esta acción.', ephemeral: true });
        }
    }
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

client.login(config.token);
