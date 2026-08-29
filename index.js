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
    dailyVoice: new Map()      
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
        // 1. تحديث توب الكلمات (يحتوي على زر My Stats فقط بدون زر رسالة من مجهول)
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

        // عند الضغط على زر رسالة من مجهول الأساسي -> يرسل الزرين فقط بدون أي نص فوقهم
        if (interaction.customId === 'anonymous_msg_btn') {
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('reveal_identity').setLabel('كشف الهوية').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('hide_identity').setLabel('إخفاء الهوية').setStyle(ButtonStyle.Danger)
            );

            await interaction.reply({
                components: [row],
                ephemeral: true
            });
        }

        // عند اختيار كشف أو إخفاء الهوية
        if (interaction.customId === 'reveal_identity' || interaction.customId === 'hide_identity') {
            const isReveal = interaction.customId === 'reveal_identity';

            await interaction.update({
                content: 'اكتب رسالتك مع المنشن فقطط',
                components: [],
                ephemeral: true
            });

            // انتظار رسالة المستخدم التالية في نفس الشات
            const filter = m => m.author.id === interaction.user.id;
            const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 60000 });

            collector.on('collect', async m => {
                try {
                    await m.delete().catch(() => {}); // حذف رسالة الشخص بأقل من ثانية
                } catch (err) {}

                const targetUser = m.mentions.users.first();

                // إذا لم يوجد منشن أو قام بمنشن نفسه
                if (!targetUser || targetUser.id === interaction.user.id) {
                    await interaction.followUp({
                        content: 'المنشن غلط',
                        ephemeral: true
                    });
                    return;
                }

                const content = m.content;
                const senderName = isReveal ? `<@${interaction.user.id}>` : 'مجهول الهويه';

                // إرسال الرسالة للخاص للشخص المُمنشن بالشكل المطلوب
                try {
                    await targetUser.send(`عندك رسالة من مجهول\nالرسالة : ${content}\nالراسل : ${senderName}`);
                } catch (err) {
                    console.log('Could not send DM.');
                }

                // تأكيد الإرسال للمرسل بالرسالة الزرقاء السرية
                await interaction.followUp({
                    content: `تم ارسال الرساله الى <@${targetUser.id}>`,
                    ephemeral: true
                });
            });
        }
    }
});

client.login(process.env.TOKEN);
