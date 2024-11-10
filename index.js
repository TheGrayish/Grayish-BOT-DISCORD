// index.js

const config = require('./config.json');
const express = require('express');
const {
    Client,
    GatewayIntentBits,
    Partials,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Events,
    EmbedBuilder,
    InteractionType,
} = require('discord.js');
const { DisTube } = require('distube');
const { SoundCloudPlugin } = require('@distube/soundcloud');
const { SpotifyPlugin } = require('@distube/spotify');
const { YouTubePlugin } = require('@distube/youtube');
const { getVoiceConnection } = require('@discordjs/voice');
require('dotenv').config();

const app = express();
const port = 3000;
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Channel],
});

const distube = new DisTube(client, {
    plugins: [new YouTubePlugin(), new SpotifyPlugin(), new SoundCloudPlugin()],
});

const controlMessages = new Map();
const currentQueuePage = new Map();

app.listen(port, () => {
    console.log(`Servidor escuchando en http://localhost:${port}`);
});

function paginateQueue(queue, page = 0, pageSize = 10) {
    const totalPages = Math.ceil(queue.length / pageSize);
    const start = page * pageSize;
    const end = start + pageSize;
    const paginatedSongs = queue.slice(start, end);
    return {
        songs: paginatedSongs,
        page,
        totalPages,
    };
}

client.once('ready', () => {
    console.log('El Bot está encendido');
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const prefix = '-';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(' ');
    const command = args.shift().toLowerCase();

    // Respuestas automáticas
    const responses = {
        hola: "Pícate la cola mejor",
        valo: "@everyone Saquen el valo",
        fort: "@everyone Saquen el fortnite",
        chupi: "@everyone HOY SE BEBE, PREPÁRENSE PARA EL CHUPI",
        cs: "@everyone Saca el counter",
    };
    if (responses[command]) {
        return message.reply({ content: responses[command] });
    }

    // Comandos con prefijo
    if (command === 'play' || command === 'p') {
        const query = args.join(' ');
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
            message.reply(`🎶 Buscando y reproduciendo: **${query}**`);
        } catch (err) {
            console.error('Error al intentar reproducir el audio:', err);
            message.reply('Hubo un error al intentar reproducir la canción.');
        }
    } else if (command === 'pause' || command === 'pa') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('No hay ninguna canción en reproducción.');
        if (queue.paused) return message.reply('La canción ya está pausada.');
        queue.pause();
        message.reply('⏸️ La canción ha sido pausada.');
    } else if (command === 'resume' || command === 'r') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('No hay ninguna canción en reproducción.');
        if (!queue.paused) return message.reply('La canción ya está en reproducción.');
        queue.resume();
        message.reply('▶️ La canción ha sido reanudada.');
    } else if (command === 'skip' || command === 's') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('No hay canciones en la cola.');
        if (queue.songs.length <= 1) return message.reply('No hay otra canción en la cola para saltar.');
        queue.skip();
        message.reply('⏭️ Canción saltada.');
    } else if (command === 'stop' || command === 'st') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('No hay ninguna canción en reproducción.');

        queue.stop();
        const voiceConnection = getVoiceConnection(message.guildId);
        if (voiceConnection) voiceConnection.destroy();

        message.reply('⏹️ La reproducción ha sido detenida y el bot ha salido del canal de voz.');
    } else if (command === 'shuffle' || command === 'sh') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('No hay canciones en la cola.');
        queue.shuffle();
        message.reply('🔀 La cola ha sido mezclada.');
    } else if (command === 'loop' || command === 'l') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('No hay ninguna canción en reproducción.');

        const modeArg = args[0];
        let mode = null;

        if (modeArg === 'off') {
            mode = 0;
        } else if (modeArg === 'song') {
            mode = 1;
        } else if (modeArg === 'queue') {
            mode = 2;
        } else {
            return message.reply('Por favor, especifica un modo de bucle válido: `off`, `song` o `queue`.');
        }

        queue.setRepeatMode(mode);
        const modeText = mode === 0 ? 'desactivado' : mode === 1 ? 'Bucle de canción' : 'Bucle de cola';
        message.reply(`🔁 Modo de repetición establecido a **${modeText}**.`);
    } else if (command === 'showqueue' || command === 'q') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('No hay canciones en la cola.');

        const paginatedQueue = paginateQueue(queue.songs, 0, 10);
        const queueEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle('🎵 Cola de canciones')
            .setDescription(paginatedQueue.songs.map((song, i) => `**${i + 1}.** 🎶 **${song.name}** - \`${song.formattedDuration}\``).join('\n'))
            .setFooter({ text: `Página 1 de ${paginatedQueue.totalPages}` });

        const paginationButtons = createPaginationButtons(0, paginatedQueue.totalPages);

        message.channel.send({ embeds: [queueEmbed], components: [paginationButtons] });
    } else if (command === 'remove' || command === 'rm') {
        const queue = distube.getQueue(message);
        if (!queue) return message.reply('No hay canciones en la cola.');

        const index = parseInt(args[0]) - 1;
        if (isNaN(index)) {
            return message.reply('Por favor, proporciona el número de la canción en la cola que deseas eliminar.');
        }

        if (index <= 0 || index >= queue.songs.length) {
            return message.reply(`Por favor, proporciona un número entre 2 y ${queue.songs.length}. No puedes eliminar la canción en reproducción.`);
        }

        const removedSong = queue.songs.splice(index, 1)[0];
        message.reply(`🗑️ Se ha eliminado **[${removedSong.name}](${removedSong.url})** de la cola.`);
    } else if (command === 'help' || command === 'h') {
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
                { name: '📜 **Mostrar Cola**', value: '`-showqueue` o `-q` - Muestra la cola de canciones actual.' },
                { name: '🛑 **Detener Reproducción**', value: '`-stop` o `-st` - Detiene la reproducción y saca al bot del canal de voz.' },
                { name: '🔁 **Modo Loop**', value: '`-loop <off|song|queue>` o `-l` - Establece el modo de repetición.' },
                { name: '🗑️ **Eliminar Canción de la Cola**', value: '`-remove <número>` o `-rm` - Elimina la canción en la posición especificada de la cola.' },
                { name: '❓ **Ayuda**', value: '`-help` o `-h` - Muestra este mensaje de ayuda.' },
                { name: '🖼️ **Avatar**', value: '`-avatar [usuario]` - Muestra la imagen de perfil de un usuario.' }
            )
            .setFooter({ text: 'Usa estos comandos para disfrutar de la música en tu servidor.' });

        message.channel.send({ embeds: [helpEmbed] });
    } else if (command === 'avatar') {
        let user = message.mentions.users.first() || message.author;

        const avatarEmbed = new EmbedBuilder()
            .setColor(0x3498db)
            .setTitle(`Avatar de ${user.username}`)
            .setImage(user.displayAvatarURL({ size: 1024, dynamic: true }))
            .setDescription(`[Descargar Imagen](${user.displayAvatarURL({ size: 1024, dynamic: true })})`);

        message.channel.send({ embeds: [avatarEmbed] });
    }
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.type === InteractionType.ApplicationCommand) {
            const { commandName } = interaction;

            if (commandName === 'play') {
                await interaction.deferReply();

                const query = interaction.options.getString('cancion');
                const voiceChannel = interaction.member.voice.channel;

                if (!voiceChannel) {
                    return interaction.editReply('¡Debes estar en un canal de voz para reproducir música!');
                }

                const botVoiceChannel = interaction.guild.members.me.voice.channel;

                if (botVoiceChannel && botVoiceChannel !== voiceChannel) {
                    return interaction.editReply('¡Debes estar en el mismo canal de voz que el bot para usar este comando!');
                }

                try {
                    await distube.play(voiceChannel, query, {
                        textChannel: interaction.channel,
                        member: interaction.member,
                    });
                    await interaction.editReply(`🎶 Buscando y reproduciendo: **${query}**`);
                } catch (err) {
                    console.error('Error al reproducir la canción:', err);
                    await interaction.editReply('Hubo un error al intentar reproducir la canción.');
                }
            } else if (commandName === 'pause') {
                const queue = distube.getQueue(interaction.guildId);
                if (!queue) {
                    return interaction.reply('No hay ninguna canción en reproducción.');
                }
                if (queue.paused) {
                    return interaction.reply('La canción ya está pausada.');
                }
                queue.pause();
                interaction.reply('⏸️ La canción ha sido pausada.');
            } else if (commandName === 'resume') {
                const queue = distube.getQueue(interaction.guildId);
                if (!queue) {
                    return interaction.reply('No hay ninguna canción en reproducción.');
                }
                if (!queue.paused) {
                    return interaction.reply('La canción ya está en reproducción.');
                }
                queue.resume();
                interaction.reply('▶️ La canción ha sido reanudada.');
            } else if (commandName === 'skip') {
                const queue = distube.getQueue(interaction.guildId);
                if (!queue) {
                    return interaction.reply('No hay canciones en la cola.');
                }
                if (queue.songs.length <= 1) {
                    return interaction.reply('No hay otra canción en la cola para saltar.');
                }
                queue.skip();
                interaction.reply('⏭️ Canción saltada.');
            } else if (commandName === 'stop') {
                const queue = distube.getQueue(interaction.guildId);
                if (!queue) {
                    return interaction.reply('No hay ninguna canción en reproducción.');
                }

                queue.stop();
                const voiceConnection = getVoiceConnection(interaction.guildId);
                if (voiceConnection) voiceConnection.destroy();

                interaction.reply('⏹️ La reproducción ha sido detenida y el bot ha salido del canal de voz.');
            } else if (commandName === 'shuffle') {
                const queue = distube.getQueue(interaction.guildId);
                if (!queue) {
                    return interaction.reply('No hay canciones en la cola.');
                }
                queue.shuffle();
                interaction.reply('🔀 La cola ha sido mezclada.');
            } else if (commandName === 'loop') {
                const queue = distube.getQueue(interaction.guildId);
                if (!queue) {
                    return interaction.reply('No hay ninguna canción en reproducción.');
                }

                const modeArg = interaction.options.getString('modo');
                let mode = null;

                if (modeArg === 'off') {
                    mode = 0;
                } else if (modeArg === 'song') {
                    mode = 1;
                } else if (modeArg === 'queue') {
                    mode = 2;
                } else {
                    return interaction.reply('Por favor, especifica un modo de bucle válido: `off`, `song` o `queue`.');
                }

                queue.setRepeatMode(mode);
                const modeText = mode === 0 ? 'desactivado' : mode === 1 ? 'Bucle de canción' : 'Bucle de cola';
                interaction.reply(`🔁 Modo de repetición establecido a **${modeText}**.`);
            } else if (commandName === 'queue') {
                const queue = distube.getQueue(interaction.guildId);
                if (!queue) {
                    return interaction.reply('No hay canciones en la cola.');
                }

                const paginatedQueue = paginateQueue(queue.songs, 0, 10);
                const queueEmbed = new EmbedBuilder()
                    .setColor(0x3498db)
                    .setTitle('🎵 Cola de canciones')
                    .setDescription(paginatedQueue.songs.map((song, i) => `**${i + 1}.** 🎶 **${song.name}** - \`${song.formattedDuration}\``).join('\n'))
                    .setFooter({ text: `Página 1 de ${paginatedQueue.totalPages}` });

                const paginationButtons = createPaginationButtons(0, paginatedQueue.totalPages);

                interaction.reply({ embeds: [queueEmbed], components: [paginationButtons] });
            } else if (commandName === 'avatar') {
                let user = interaction.options.getUser('usuario') || interaction.user;

                const avatarEmbed = new EmbedBuilder()
                    .setColor(0x3498db)
                    .setTitle(`Avatar de ${user.username}`)
                    .setImage(user.displayAvatarURL({ size: 1024, dynamic: true }))
                    .setDescription(`[Descargar Imagen](${user.displayAvatarURL({ size: 1024, dynamic: true })})`);

                interaction.reply({ embeds: [avatarEmbed] });
            } else if (commandName === 'remove') {
                const queue = distube.getQueue(interaction.guildId);
                if (!queue) {
                    return interaction.reply('No hay canciones en la cola.');
                }

                const index = interaction.options.getInteger('numero') - 1;
                if (isNaN(index)) {
                    return interaction.reply('Por favor, proporciona el número de la canción en la cola que deseas eliminar.');
                }

                if (index <= 0 || index >= queue.songs.length) {
                    return interaction.reply(`Por favor, proporciona un número entre 2 y ${queue.songs.length}. No puedes eliminar la canción en reproducción.`);
                }

                const removedSong = queue.songs.splice(index, 1)[0];
                interaction.reply(`🗑️ Se ha eliminado **[${removedSong.name}](${removedSong.url})** de la cola.`);
            }
            
        } else if (interaction.isButton()) {
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

            switch (interaction.customId) {
                case 'pause':
                    if (!queue || !queue.songs) {
                        return interaction.reply({ content: 'No hay ninguna canción en reproducción.', ephemeral: true });
                    }
                    if (queue.paused) {
                        return interaction.reply({ content: 'La canción ya está pausada.', ephemeral: true });
                    }
                    queue.pause();
                    await interaction.reply('⏸️ La canción ha sido pausada.');
                    break;

                case 'resume':
                    if (!queue || !queue.songs) {
                        return interaction.reply({ content: 'No hay ninguna canción en reproducción.', ephemeral: true });
                    }
                    if (!queue.paused) {
                        return interaction.reply({ content: 'La canción ya está en reproducción.', ephemeral: true });
                    }
                    queue.resume();
                    await interaction.reply('▶️ La canción ha sido reanudada.');
                    break;

                case 'skip':
                    if (!queue || !queue.songs) {
                        return interaction.reply({ content: 'No hay canciones en la cola.', ephemeral: true });
                    }
                    if (queue.songs.length <= 1) {
                        return interaction.reply({ content: 'No hay otra canción en la cola para saltar.', ephemeral: true });
                    } else {
                        queue.skip();
                        await interaction.reply('⏭️ Canción saltada.');
                    }
                    break;

                case 'loop':
                    if (!queue) {
                        return interaction.reply({ content: 'No hay ninguna canción en reproducción.', ephemeral: true });
                    }
                    let mode = (queue.repeatMode + 1) % 3;
                    queue.setRepeatMode(mode);
                    const modeText = mode === 0 ? 'desactivado' : mode === 1 ? 'Bucle de canción' : 'Bucle de cola';
                    await interaction.reply(`🔁 Modo de repetición establecido a **${modeText}**.`);
                    sendControlMessage(queue, queue.songs[0]);
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
                        const guildId = interaction.guildId;
                        const controlMessage = controlMessages.get(guildId);
                        if (controlMessage) await controlMessage.delete();
                    } else {
                        await interaction.reply({ content: 'No hay ninguna canción en reproducción.', ephemeral: true });
                    }
                    break;

                default:
                    await interaction.reply({ content: 'Acción no reconocida.', ephemeral: true });
                    break;
            }
        }
    } catch (error) {
        console.error('Error en la interacción:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Hubo un error al procesar esta acción.', ephemeral: true });
        }
    }
});

// Función para enviar el mensaje de control con botones
async function sendControlMessage(queue, song) {
    const buttons1 = new ActionRowBuilder()
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
                .setStyle(ButtonStyle.Primary)
        );

    const buttons2 = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('loop')
                .setLabel('🔁 Loop')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('stop')
                .setLabel('⏹️ Detener')
                .setStyle(ButtonStyle.Danger)
        );

    const embed = new EmbedBuilder()
        .setColor(0x3498db)
        .setTitle('🎶 Ahora Reproduciendo')
        .setDescription(`**[${song.name}](${song.url})**`)
        .setThumbnail(song.thumbnail)
        .addFields(
            { name: 'Duración', value: song.formattedDuration, inline: true },
            { name: 'Solicitado por', value: song.user.toString(), inline: true },
            { name: 'Modo de Repetición', value: queue.repeatMode === 0 ? 'Desactivado' : queue.repeatMode === 1 ? 'Bucle de Canción' : 'Bucle de Cola', inline: true }
        )
        .setFooter({ text: `Vistas: ${song.views} | Likes: ${song.likes}` });

    const guildId = queue.textChannel.guild.id;
    const previousMessage = controlMessages.get(guildId);

    if (previousMessage) {
        try {
            await previousMessage.delete();
        } catch (error) {
            // Manejo de error si no se puede eliminar el mensaje anterior
        }
    }

    const newMessage = await queue.textChannel.send({
        embeds: [embed],
        components: [buttons1, buttons2]
    });

    controlMessages.set(guildId, newMessage);
}

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

// Eventos de DisTube
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

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

client.login(config.token);
