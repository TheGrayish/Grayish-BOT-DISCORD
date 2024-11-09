const config = require('./config.json');
const express = require('express');
const { Client, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, Events, EmbedBuilder } = require('discord.js');
const { DisTube } = require('distube');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { SpotifyPlugin } = require('@distube/spotify');
const { YouTubePlugin } = require('@distube/youtube');
const { getVoiceConnection } = require('@discordjs/voice');
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

    const commands = {
        play: ['-play', '-p'],
        shuffle: ['-shuffle', '-sh'],
        pause: ['-pause', '-pa'],
        resume: ['-resume', '-r'],
        skip: ['-skip', '-s'],
        showQueue: ['-showQueue', '-q'],
        stop: ['-stop', '-st'],
        help: ['-help', '-h']
    };

    const args = message.content.split(' ');
    const command = args[0];

    // Comando de ayuda
    if (commands.help.includes(command)) {
        const helpEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('🎶 Comandos del Bot de Música')
            .setDescription('Usa los siguientes comandos para controlar el bot de música:')
            .addFields(
                { name: '▶️ **Reproducir Canción**', value: '`-play <nombre o enlace>` o `-p` - Reproduce una canción o la añade a la cola si ya hay canciones en reproducción.' },
                { name: '🔀 **Mezclar Cola**', value: '`-shuffle` o `-sh` - Mezcla aleatoriamente las canciones en la cola.' },
                { name: '⏸️ **Pausar Canción**', value: '`-pause` o `-pa` - Pausa la canción actual en reproducción.' },
                { name: '⏯️ **Reanudar Canción**', value: '`-resume` o `-r` - Reanuda la canción pausada.' },
                { name: '⏭️ **Saltar Canción**', value: '`-skip` o `-s` - Salta a la siguiente canción en la cola.' },
                { name: '📜 **Mostrar Cola**', value: '`-showQueue` o `-q` - Muestra la cola de canciones actual.' },
                { name: '🛑 **Detener Reproducción**', value: '`-stop` o `-st` - Detiene la reproducción y saca al bot del canal de voz.' },
                { name: '❓ **Ayuda**', value: '`-help` o `-h` - Muestra este mensaje de ayuda.' }
            )
            .setFooter({ text: 'Usa estos comandos para disfrutar de la música en tu servidor.' });

        return message.channel.send({ embeds: [helpEmbed] });
    }

    // Comando de reproducción
    if (commands.play.includes(command)) {
        const query = args.slice(1).join(' ');
        if (!query) return message.reply('Proporciona un enlace o nombre de una canción.');

        const voiceChannel = message.member.voice.channel;
        if (!voiceChannel) return message.reply('¡Debes estar en un canal de voz para reproducir música!');

        const botVoiceChannel = message.guild.members.me.voice.channel;

        if (botVoiceChannel && botVoiceChannel !== voiceChannel) {
            return message.reply('¡Debes estar en el mismo canal de voz que el bot para usar este comando!');
        }

        try {
            await distube.play(voiceChannel, query, {
                textChannel: message.channel,
                member: message.member,
            });
        } catch (err) {
            console.error('Error al intentar reproducir el audio:', err);
            message.reply("Hubo un error al intentar reproducir la canción.");
        }
    }

    // Comando de shuffle
    if (commands.shuffle.includes(command)) {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply("No hay canciones en la cola.");
        queue.shuffle();
        message.reply("🔀 La cola ha sido mezclada.");
    }

    // Comando de pausa
    if (commands.pause.includes(command)) {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply("No hay ninguna canción en reproducción.");
        if (queue.paused) return message.reply("La canción ya está pausada.");
        queue.pause();
        message.reply("⏸️ La canción ha sido pausada.");
    }

    // Comando de reanudar
    if (commands.resume.includes(command)) {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply("No hay ninguna canción pausada.");
        if (!queue.paused) return message.reply("La canción ya está en reproducción.");
        queue.resume();
        message.reply("▶️ La canción ha sido reanudada.");
    }

    // Comando de skip
    if (commands.skip.includes(command)) {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply("No hay canciones en la cola.");
        if (queue.songs.length <= 1) return message.reply("No hay otra canción en la cola para saltar.");
        queue.skip();
        message.reply("⏭️ Canción saltada.");
    }

    // Comando de mostrar cola
    if (commands.showQueue.includes(command)) {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply("No hay canciones en la cola.");

        const paginatedQueue = paginateQueue(queue.songs, 0, 10);
        const queueEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('🎵 Cola de canciones')
            .setDescription(paginatedQueue.songs.map((song, i) => `**${i + 1}.** 🎶 **${song.name}** - \`${song.formattedDuration}\``).join('\n'))
            .setFooter({ text: `Página 1 de ${paginatedQueue.totalPages}` });

        const paginationButtons = createPaginationButtons(0, paginatedQueue.totalPages);

        message.channel.send({ embeds: [queueEmbed], components: [paginationButtons] });
    }

    // Comando de detener
    if (commands.stop.includes(command)) {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply("No hay ninguna canción en reproducción.");

        queue.stop();
        const voiceConnection = getVoiceConnection(message.guildId);
        if (voiceConnection) voiceConnection.destroy();

        message.reply("⏹️ La reproducción ha sido detenida y el bot ha salido del canal de voz.");
    }

});

// Función para enviar el mensaje de control con botones
async function sendControlMessage(queue, song) {
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

    if (controlMessage) {
        try {
            await controlMessage.delete();
        } catch (error) {
            if (error.code !== 10008) { // Si el error es distinto a "Unknown Message"
                console.error("Error al intentar eliminar el mensaje de control:", error);
            }
        }
    }

    controlMessage = await queue.textChannel.send({
        content: `🎶 Reproduciendo ahora: **${song.name}** - \`${song.formattedDuration}\``,
        components: [buttons]
    });
}

distube.on('playSong', (queue, song) => {
    sendControlMessage(queue, song);
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

// Función para crear los botones de paginación
function createPaginationButtons(page, totalPages) {
    return new ActionRowBuilder()
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
                .setDisabled(page === totalPages - 1)
        );
}

// Manejo de interacciones con los botones
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    const queue = distube.getQueue(interaction.guildId);
    const botVoiceChannel = interaction.guild.members.me.voice.channel;
    const userVoiceChannel = interaction.member.voice.channel;

    if (!userVoiceChannel) {
        return interaction.reply({ content: '¡Debes estar en un canal de voz para usar los controles!', ephemeral: true });
    }

    if (botVoiceChannel && botVoiceChannel !== userVoiceChannel) {
        return interaction.reply({ content: '¡Debes estar en el mismo canal de voz que el bot para usar los controles!', ephemeral: true });
    }

    let page = currentQueuePage.get(interaction.guildId) || 0;

    try {
        switch (interaction.customId) {
            case 'pause':
                if (!queue || !queue.songs) {
                    return interaction.reply({ content: 'No hay ninguna canción en reproducción.', ephemeral: true });
                }
                if (queue.paused) {
                    await interaction.reply({ content: 'La canción ya está pausada.', ephemeral: true });
                } else {
                    queue.pause();
                    await interaction.reply('⏸️ La canción ha sido pausada.');
                }
                break;

            case 'resume':
                if (!queue || !queue.songs) {
                    return interaction.reply({ content: 'No hay ninguna canción en reproducción.', ephemeral: true });
                }
                if (!queue.paused) {
                    await interaction.reply({ content: 'La canción ya está en reproducción.', ephemeral: true });
                } else {
                    queue.resume();
                    await interaction.reply('▶️ La canción ha sido reanudada.');
                }
                break;

            case 'skip':
                if (!queue || !queue.songs) {
                    return interaction.reply({ content: 'No hay canciones en la cola.', ephemeral: true });
                }
                if (queue.songs.length <= 1) {
                    await interaction.reply({ content: 'No hay otra canción en la cola para saltar.', ephemeral: true });
                } else {
                    queue.skip();
                    await interaction.reply('⏭️ Canción saltada.');
                }
                break;

            case 'showQueue':
                if (!queue || !queue.songs) {
                    return interaction.reply({ content: 'No hay canciones en la cola.', ephemeral: true });
                }
                const paginatedQueue = paginateQueue(queue.songs, page, 10);
                const queueEmbed = new EmbedBuilder()
                    .setColor(0x3498db)
                    .setTitle('🎵 Cola de canciones')
                    .setDescription(paginatedQueue.songs.map((song, i) => `**${page * 10 + i + 1}.** 🎶 **${song.name}** - \`${song.formattedDuration}\``).join('\n'))
                    .setFooter({ text: `Página ${page + 1} de ${paginatedQueue.totalPages}` });

                const paginationButtons = createPaginationButtons(page, paginatedQueue.totalPages);

                await interaction.reply({ embeds: [queueEmbed], components: [paginationButtons], ephemeral: true });
                break;

            case 'prevPage':
                if (!queue || !queue.songs) {
                    return interaction.reply({ content: 'No hay canciones en la cola.', ephemeral: true });
                }
                page = Math.max(0, page - 1);
                currentQueuePage.set(interaction.guildId, page);
                const prevPaginatedQueue = paginateQueue(queue.songs, page, 10);

                const prevQueueEmbed = new EmbedBuilder()
                    .setColor(0x3498db)
                    .setTitle('🎵 Cola de canciones')
                    .setDescription(prevPaginatedQueue.songs.map((song, i) => `**${page * 10 + i + 1}.** 🎶 **${song.name}** - \`${song.formattedDuration}\``).join('\n'))
                    .setFooter({ text: `Página ${page + 1} de ${prevPaginatedQueue.totalPages}` });

                const prevPaginationButtons = createPaginationButtons(page, prevPaginatedQueue.totalPages);

                await interaction.update({ embeds: [prevQueueEmbed], components: [prevPaginationButtons] });
                break;

            case 'nextPage':
                if (!queue || !queue.songs) {
                    return interaction.reply({ content: 'No hay canciones en la cola.', ephemeral: true });
                }
                page = Math.min(paginateQueue(queue.songs).totalPages - 1, page + 1);
                currentQueuePage.set(interaction.guildId, page);
                const nextPaginatedQueue = paginateQueue(queue.songs, page, 10);

                const nextQueueEmbed = new EmbedBuilder()
                    .setColor(0x3498db)
                    .setTitle('🎵 Cola de canciones')
                    .setDescription(nextPaginatedQueue.songs.map((song, i) => `**${page * 10 + i + 1}.** 🎶 **${song.name}** - \`${song.formattedDuration}\``).join('\n'))
                    .setFooter({ text: `Página ${page + 1} de ${nextPaginatedQueue.totalPages}` });

                const nextPaginationButtons = createPaginationButtons(page, nextPaginatedQueue.totalPages);

                await interaction.update({ embeds: [nextQueueEmbed], components: [nextPaginationButtons] });
                break;

            case 'stop':
                if (queue) {
                    queue.stop();
                    const voiceConnection = getVoiceConnection(interaction.guildId);
                    if (voiceConnection) voiceConnection.destroy();
                    await interaction.reply('⏹️ La reproducción ha sido detenida y el bot ha salido del canal de voz.');
                    if (controlMessage) await controlMessage.delete();
                } else {
                    await interaction.reply({ content: 'No hay ninguna canción en reproducción.', ephemeral: true });
                }
                break;

            default:
                await interaction.reply({ content: 'Acción no reconocida.', ephemeral: true });
                break;
        }
    } catch (error) {
        console.error('Error en la interacción de botón:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Hubo un error al procesar esta acción.', ephemeral: true });
        }
    }
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

client.login(config.token);
