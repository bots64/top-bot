const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const TXT_CHANNEL_ID = '1543093337165144084';
const VC_CHANNEL_ID = '1543093370065260564';
const ANON_CHANNEL_ID = '1543113579962835054';

const db = {
    messages: new Map(),       
    words: new Map(),          
    voiceMinutes: new Map(),   
    dailyMessages: new Map(),  
    dailyVoice: new Map(),
    cooldowns: new Map()       
};

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await updateLeaderboards();
    setInterval(updateLeaderboards, 30000);
});

// تتبع الكلمات والرسائل العامة
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    const userId = message.author.id;
    const wordCount = message.content.trim().split(/\s+/).length;

    db.messages.set(userId, (db.messages.get(userId) || 0) + 1);
    db.words.set(userId, (db.words.get(userId) || 0) + wordCount);
    db.dailyMessages.set(userId, (db.dailyMessages.get(userId) || 0) + 1);
});

// تتبع الفويس
client.on('voiceStateUpdate', (oldState, newState) => {
    if (!oldState.channelId && newState.channelId) {
        newState.member.voiceJoinTime = Date.now();
    } else if (oldState.channelId && !newState.channelId && oldState.member.voiceJoinTime) {
        const durationMins = Math.floor((Date.now() - oldState.member.voiceJoinTime) / 60000);
        const userId = oldState.member.id;
        
        const currentMins = db.voiceMinutes.get(userId) || 0;
        db.voiceMinutes.set(userId, currentMins + durationMins);

        const currentDailyMins = db.dailyVoice.get(userId) || 0;
        db.dailyVoice.set(userId, currentDailyMins + durationMins);
    }
});

async function updateLeaderboards() {
    try {
        // 1. تحديث توب الكلمات (يحتوي على زر My Stats فقط)
        const txtChannel = await client.channels.fetch(TXT_CHANNEL_ID).catch(() => null);
        if (txtChannel) {
            const embed = new EmbedBuilder()
                .setTitle('Top Messages')
                .setColor('#1e1f22')
                .setDescription(getTopMessagesText())
                .setFooter({ text: 'Updated 30 seconds ago' });

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('my_stats_txt').setLabel('My Stats').setStyle(ButtonStyle.Secondary)
            );

            const messages = await txtChannel.messages.fetch({ limit: 10 }).catch(() => null);
            if (messages) {
                const botMessage = messages.find(m => m.author.id === client.user.id);
                if (botMessage) await botMessage.delete().catch(() => {});
            }
            await txtChannel.send({ embeds: [embed], components: [row] });
        }

        // 2. تحديث توب الفويس
        const vcChannel = await client.channels.fetch(VC_CHANNEL_ID).catch(() => null);
        if (vcChannel) {
            const embed = new EmbedBuilder()
                .setTitle('Top Voice')
                .setColor('#1e1f22')
                .setDescription(getTopVoiceText())
                .setFooter({ text: 'Updated 30 seconds ago' });

            const messages = await vcChannel.messages.fetch({ limit: 10 }).catch(() => null);
            if (messages) {
                const botMessage = messages.find(m => m.author.id === client.user.id);
                if (botMessage) await botMessage.delete().catch(() => {});
            }
            await vcChannel.send({ embeds: [embed] });
        }

        // 3. رسالة "رسالة من مجهول" في القناة المخصصة
        const anonChannel = await client.channels.fetch(ANON_CHANNEL_ID).catch(() => null);
        if (anonChannel) {
            const messages = await anonChannel.messages.fetch({ limit: 5 }).catch(() => null);
            const botMessage = messages ? messages.find(m => m.author.id === client.user.id) : null;
            
            if (!botMessage) {
                const embed = new EmbedBuilder()
                    .setColor('#1e1f22')
                    .setDescription('اكتب رسالتك بسرية تامة\nوكل شي محفوظ هنا');

                const row = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('anonymous_msg_btn').setLabel('رسالة من مجهول').setStyle(ButtonStyle.Secondary)
                );

                await anonChannel.send({ embeds: [embed], components: [row] });
            }
        }
    } catch (err) {
        console.error('Error in updateLeaderboards:', err);
    }
}

function getTopMessagesText() {
    const sorted = [...db.words.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sorted.length === 0) return 'لا توجد بيانات كافية بعد.';
    return sorted.map((item, index) => `${index + 1}. <@${item[0]}> ⎯ ${item[1]}`).join('\n');
}

function getTopVoiceText() {
    const sorted = [...db.voiceMinutes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sorted.length === 0) return 'لا توجد بيانات كافية بعد.';
    return sorted.map((item, index) => `${index + 1}. <@${item[0]}> ⎯ ${item[1] * 10}`).join('\n');
}

function formatTime(totalMins) {
    const hours = Math.floor(totalMins / 60);
    const mins = totalMins % 60;
    if (hours > 0) {
        return `${hours}h ${mins}m`;
    }
    return `${mins}m`;
}

// معالجة الأزرار
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId === 'my_stats_txt') {
            await interaction.deferReply({ ephemeral: true });
            const userId = interaction.user.id;
            
            const allWords = db.words.get(userId) || 0;
            const msgToday = db.dailyMessages.get(userId) || 0;
            
            const sortedWords = [...db.words.entries()].sort((a, b) => b[1] - a[1]);
            const rank = sortedWords.findIndex(item => item[0] === userId) + 1 || sortedWords.length + 1;

            const embed = new EmbedBuilder()
                .setTitle('My Message Stats')
                .setColor('#1e1f22')
                .setDescription(`all messages server ${allWords}\nmessages this day ${msgToday}\n#rank ${rank}`);

            await interaction.editReply({ embeds: [embed] });
        }

        // عند الضغط على زر رسالة من مجهول -> التحقق من الكولداون (5 دقائق)
        if (interaction.customId === 'anonymous_msg_btn') {
            const userId = interaction.user.id;
            const now = Date.now();
            const cooldownTime = 5 * 60 * 1000; 
            const lastTime = db.cooldowns.get(userId) || 0;

            if (now - lastTime < cooldownTime) {
                const expirationTimestamp = Math.floor((lastTime + cooldownTime) / 1000);
                await interaction.reply({
                    content: `لازم تنتظر <t:${expirationTimestamp}:R>`,
                    ephemeral: true
                });
                return;
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('reveal_identity').setLabel('كشف الهوية').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('hide_identity').setLabel('إخفاء الهوية').setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({
                components: [row],
                ephemeral: true
            });
        }

        // عند اختيار كشف أو إخفاء الهوية
        if (interaction.customId === 'reveal_identity' || interaction.customId === 'hide_identity') {
            const userId = interaction.user.id;
            db.cooldowns.set(userId, Date.now());

            const isReveal = interaction.customId === 'reveal_identity';

            await interaction.update({
                content: 'اكتب رسالتك مع المنشن',
                components: [],
                ephemeral: true
            });

            // فتح الشات لاستلام رسالة واحدة
            const filter = m => m.author.id === userId;
            const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 60000 });

            collector.on('collect', async m => {
                try {
                    await m.delete().catch(() => {}); // حذف رسالة المستخدم فوراً
                } catch (err) {}

                // جلب جميع الأشخاص المنشنين في الرسالة (سواء بالبداية، النهاية، أو أي مكان، حتى لو منشن نفسه)
                const mentionedUsers = m.mentions.users;

                // إذا لم يتم منشن أي شخص نهائياً في النص
                if (mentionedUsers.size === 0) {
                    await interaction.followUp({
                        content: 'ما في منشن',
                        ephemeral: true
                    });
                    return;
                }

                const content = m.content;
                const senderDisplay = isReveal ? `<@${userId}>` : 'مجهول الهويه';

                const sentTags = [];

                // إرسال الرسالة بالخاص لجميع المنشنين (حتى لو منشن نفسه أو عدة أشخاص)
                for (const [targetId, userObj] of mentionedUsers) {
                    if (userObj.bot) continue;

                    try {
                        await userObj.send(`عندك رسالة من مجهول\nالرسالة : ${content}\nالراسل : ${senderDisplay}`);
                        sentTags.push(`<@${targetId}>`);
                    } catch (err) {
                        console.log(`Could not send DM to ${userObj.tag}`);
                    }
                }

                if (sentTags.length === 0) {
                    await interaction.followUp({
                        content: 'ما في منشن',
                        ephemeral: true
                    });
                    return;
                }

                // إشعار المرسل بنجاح الإرسال
                await interaction.followUp({
                    content: `تم ارسال الرساله الى ${sentTags.join(', ')}`,
                    ephemeral: true
                });
            });
        }
    }
});

client.login(process.env.TOKEN);
