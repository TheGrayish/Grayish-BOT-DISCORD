const { REST, Routes } = require('discord.js');
const config = require('./config.json');
require('dotenv').config();

const commands = [
    {
        name: 'play',
        description: 'Reproduce una canción o la añade a la cola.',
        options: [
            {
                name: 'cancion',
                type: 3, // STRING
                description: 'Nombre o enlace de la canción',
                required: true,
            },
        ],
    },
    {
        name: 'pause',
        description: 'Pausa la canción actual en reproducción.',
    },
    {
        name: 'resume',
        description: 'Reanuda la canción pausada.',
    },
    {
        name: 'skip',
        description: 'Salta a la siguiente canción en la cola.',
    },
    {
        name: 'stop',
        description: 'Detiene la reproducción y saca al bot del canal de voz.',
    },
    {
        name: 'shuffle',
        description: 'Mezcla aleatoriamente las canciones en la cola.',
    },
    {
        name: 'loop',
        description: 'Establece el modo de repetición.',
        options: [
            {
                name: 'modo',
                type: 3, // STRING
                description: 'Modo de repetición: off, song, queue',
                required: true,
                choices: [
                    { name: 'Off', value: 'off' },
                    { name: 'Canción', value: 'song' },
                    { name: 'Cola', value: 'queue' },
                ],
            },
        ],
    },
    {
        name: 'queue',
        description: 'Muestra la cola de canciones actual.',
    },
    {
        name: 'avatar',
        description: 'Muestra la imagen de perfil de un usuario.',
        options: [
            {
                name: 'usuario',
                type: 6, // USER
                description: 'El usuario del cual quieres ver el avatar',
                required: false,
            },
        ],
    },
    {
        name: 'remove',
        description: 'Elimina una canción de la cola.',
        options: [
            {
                name: 'numero',
                type: 4, // INTEGER
                description: 'El número de la canción en la cola que deseas eliminar',
                required: true,
            },
        ],
    },
    // Añade más comandos aquí...
];

const rest = new REST({ version: '10' }).setToken(config.token);

(async () => {
    try {
        console.log('Registrando comandos (/)...');

        await rest.put(
            Routes.applicationCommands(config.clientId),
            { body: commands },
        );

        console.log('Comandos registrados exitosamente.');
    } catch (error) {
        console.error(error);
    }
})();