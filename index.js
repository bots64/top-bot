const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('Bot is active and running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

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
const EXCLUDED_ROLE_ID = '1535875661997277194';
const ADMIN_ROLE_ID = '1544487320357572629';

const db = {
    messages: new Map(),       
    voiceMinutes: new Map(),   
    dailyMessages: new Map(),  
    dailyVoice: new Map(),
    cooldowns: new Map(),
    bannedUsers: new Set()     
};

// تصفير البيانات كل 30 يوم
const RESET_INTERVAL = 30 * 24 * 60 * 60 * 1000;
setInterval(() => {
    db.messages.clear();
    db.voiceMinutes.clear();
    db.dailyMessages.clear();
    db.dailyVoice.clear();
    db.bannedUsers.clear();
    console.log('Leaderboards have been reset automatically for the 30-day cycle.');
}, RESET_INTERVAL);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    await updateLeaderboards();
    setInterval(updateLeaderboards, 30000);
});

function isExcluded(member) {
    if (!member) return true;
    if (member.user.bot) return true;
    if (member.roles.cache.has(EXCLUDED_ROLE_ID)) return true;
    if (db.bannedUsers.has(member.id)) return true;
    return false;
}

// تتبع الرسائل والشات والأوامر الإدارية
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const content = message.content.trim();

    // التحقق من الأوامر الإدارية (rest chat, rest voice, اعطاء, سحب, leve, come)
    if (content.startsWith('rest chat') || content.startsWith('rest voice') || content.startsWith('اعطاء') || content.startsWith('سحب') || content.startsWith('leve ') || content.startsWith('come ')) {
        
        // التحقق الدقيق من الرول المخصص فقط
        if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
            await message.react('❌').catch(() => {});
            return;
        }

        // أمر rest chat
        if (content === 'rest chat') {
            db.messages.clear();
            db.dailyMessages.clear();
            await updateLeaderboards();
            await message.react('✅').catch(() => {});
            return;
        }

        // أمر rest voice
        if (content === 'rest voice') {
            db.voiceMinutes.clear();
            db.dailyVoice.clear();
            await updateLeaderboards();
            await message.react('✅').catch(() => {});
            return;
        }

        // أمر leve (إبعاد من التوب)
        if (content.startsWith('leve ')) {
            const targetMember = message.mentions.members.first();
            if (!targetMember) {
                await message.react('❌').catch(() => {});
                return;
            }
            db.bannedUsers.add(targetMember.id);
            await updateLeaderboards();
            await message.react('✅').catch(() => {});
            return;
        }

        // أمر come (إرجاع للتوب)
        if (content.startsWith('come ')) {
            const targetMember = message.mentions.members.first();
            if (!targetMember) {
                await message.react('❌').catch(() => {});
                return;
            }
            db.bannedUsers.delete(targetMember.id);
            await updateLeaderboards();
            await message.react('✅').catch(() => {});
            return;
        }

        // أمر اعطاء (يدعم اعطاء [رقم] @منشن أو اعطاء [رقم] chat/voice @منشن)
        if (content.startsWith('اعطاء')) {
            const targetMember = message.mentions.members.first();
            if (!targetMember) {
                await message.react('❌').catch(() => {});
                return;
            }

            const matchNum = content.match(/\d+/);
            const amount = matchNum ? parseInt(matchNum[0]) : 0;
            if (amount <= 0) {
                await message.react('❌').catch(() => {});
                return;
            }

            const isVoice = content.includes('voice');
            const isChat = content.includes('chat') || (!isVoice); // افتراضي أو صريح للشات والفويس معاً إذا لم يحدد، أو حددها حسب الطلب (الطلب: يعطيني 1000 نقطه بالشات والفويس)

            if (content.includes('voice')) {
                const currentVoice = db.voiceMinutes.get(targetMember.id) || 0;
                db.voiceMinutes.set(targetMember.id, currentVoice + amount);
            } else if (content.includes('chat')) {
                const currentMsg = db.messages.get(targetMember.id) || 0;
                db.messages.set(targetMember.id, currentMsg + amount);
            } else {
                // إذا كتب "اعطاء 1000 @منشن" بدون تحديد، يضيف للشات والفويس معاً أو حسب ما طلبت
                const currentMsg = db.messages.get(targetMember.id) || 0;
                db.messages.set(targetMember.id, currentMsg + amount);
                const currentVoice = db.voiceMinutes.get(targetMember.id) || 0;
                db.voiceMinutes.set(targetMember.id, currentVoice + amount);
            }

            await updateLeaderboards();
            await message.react('✅').catch(() => {});
            return;
        }

        // أمر سحب
        if (content.startsWith('سحب')) {
            const targetMember = message.mentions.members.first();
            if (!targetMember) {
                await message.react('❌').catch(() => {});
                return;
            }

            const matchNum = content.match(/\d+/);
            const amount = matchNum ? parseInt(matchNum[0]) : 0;
            if (amount <= 0) {
                await message.react('❌').catch(() => {});
                return;
            }

            const currentMsg = db.messages.get(targetMember.id) || 0;
            if (currentMsg < amount) {
                await message.react('❌').catch(() => {});
                return;
            }

            db.messages.set(targetMember.id, currentMsg - amount);
            await updateLeaderboards();
            await message.react('✅').catch(() => {});
            return;
        }
    }

    // استبعاد رسائل الروم الصوتي (Text-in-Voice channels تحتوي على thread أو channel مرتبط بفويس)
    if (message.channel.isThread() || message.channel.rateLimitPerUser !== undefined && message.channel.parent && message.channel.parent.type === 2) {
        // إذا كانت القناة تابعة لروم صوتي أو شات داخل فويس، لا نحسبها
        return;
    }
    // احتياطياً: إذا كانت القناة مصنفة كفويس أو تحتوي على خاصية voice
    if (message.channel.type === 11 || message.channel.type === 12) return; // Threads

    if (isExcluded(message.member)) return;
    
    const userId = message.author.id;

    // كل رسالة = 1 نقطة
    db.messages.set(userId, (db.messages.get(userId) || 0) + 1);
    db.dailyMessages.set(userId, (db.dailyMessages.get(userId) || 0) + 1);
});

// تتبع الفويس (في أي روم صوتي، كل دقيقة = 1 نقطة)
const voiceTimers = new Map();

client.on('voiceStateUpdate', (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || isExcluded(member)) return;

    const userId = member.id;

    // إذا دخل أي روم صوتي ولم يكن في روم من قبل
    if (!oldState.channelId && newState.channelId) {
        voiceTimers.set(userId, Date.now());
    } 
    // إذا خرج تماماً من الرومات الصوتية
    else if (oldState.channelId && !newState.channelId) {
        const joinTime = voiceTimers.get(userId);
        if (joinTime) {
            const durationMins = Math.floor((Date.now() - joinTime) / 60000);
            if (durationMins > 0) {
                db.voiceMinutes.set(userId, (db.voiceMinutes.get(userId) || 0) + durationMins);
                db.dailyVoice.set(userId, (db.dailyVoice.get(userId) || 0) + durationMins);
            }
            voiceTimers.delete(userId);
        }
    }
});

// عداد دوري لاحتساب الدقائق لمن هم متواجدين بالفويس كل دقيقة تلقائياً
setInterval(() => {
    for (const [userId, joinTime] of voiceTimers.entries()) {
        const durationMins = Math.floor((Date.now() - joinTime) / 60000);
        if (durationMins >= 1) {
            db.voiceMinutes.set(userId, (db.voiceMinutes.get(userId) || 0) + 1);
            db.dailyVoice.set(userId, (db.dailyVoice.get(userId) || 0) + 1);
            // تحديث وقت البداية لدقيقة جديدة لتجنب التكرار المضاعف
            voiceTimers.set(userId, Date.now());
        }
    }
}, 60000);

async function updateLeaderboards() {
    try {
        // 1. تحديث توب الشات
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

        // 3. رسالة مجهول
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
    const sorted = [...db.messages.entries()].filter(([userId]) => !db.bannedUsers.has(userId)).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sorted.length === 0) return 'لا توجد بيانات كافية بعد.';
    return sorted.map((item, index) => `${index + 1}. <@${item[0]}> ⎯ ${item[1]}`).join('\n');
}

function getTopVoiceText() {
    const sorted = [...db.voiceMinutes.entries()].filter(([userId]) => !db.bannedUsers.has(userId)).sort((a, b) => b[1] - a[1]).slice(0, 10);
    if (sorted.length === 0) return 'لا توجد بيانات كافية بعد.';
    return sorted.map((item, index) => `${index + 1}. <@${item[0]}> ⎯ ${item[1]}`).join('\n');
}

// معالجة الأزرار (My Stats)
client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId === 'my_stats_txt') {
            await interaction.deferReply({ ephemeral: true });
            const userId = interaction.user.id;
            
            const allMessages = db.messages.get(userId) || 0;
            const msgToday = db.dailyMessages.get(userId) || 0;
            
            const sortedMessages = [...db.messages.entries()].filter(([id]) => !db.bannedUsers.has(id)).sort((a, b) => b[1] - a[1]);
            const rank = sortedMessages.findIndex(item => item[0] === userId) + 1 || sortedMessages.length + 1;

            const embed = new EmbedBuilder()
                .setTitle('My Message Stats')
                .setColor('#1e1f22')
                .setDescription(`all messages server ${allMessages}\nmessages this day ${msgToday}\n#rank ${rank}`);

            await interaction.editReply({ embeds: [embed] });
        }

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

        if (interaction.customId === 'reveal_identity' || interaction.customId === 'hide_identity') {
            const userId = interaction.user.id;
            db.cooldowns.set(userId, Date.now());

            const isReveal = interaction.customId === 'reveal_identity';

            await interaction.update({
                content: 'اكتب رسالتك مع المنشن',
                components: [],
                ephemeral: true
            });

            const filter = m => m.author.id === userId;
            const collector = interaction.channel.createMessageCollector({ filter, max: 1, time: 60000 });

            collector.on('collect', async m => {
                try {
                    await m.delete().catch(() => {});
                } catch (err) {}

                const mentionedUsers = m.mentions.users;
                if (mentionedUsers.size === 0) {
                    await interaction.followUp({ content: 'ما في منشن', ephemeral: true });
                    return;
                }

                let cleanContent = m.content;
                mentionedUsers.forEach(user => {
                    cleanContent = cleanContent.replace(new RegExp(`<@!?${user.id}>`, 'g'), '').trim();
                });

                const senderMember = await m.guild.members.fetch(userId).catch(() => null);
                const senderName = senderMember ? senderMember.user.tag : 'مستخدم';
                const senderDisplay = isReveal ? senderName : 'مجهول الهويه';

                const sentTags = [];
                for (const [targetId, userObj] of mentionedUsers) {
                    if (userObj.bot) continue;
                    try {
                        await userObj.send(`عندك رسالة من مجهول\nالرسالة : ${cleanContent}\nالراسل : ${senderDisplay}`);
                        sentTags.push(`<@${targetId}>`);
                    } catch (err) {}
                }

                if (sentTags.length === 0) {
                    await interaction.followUp({ content: 'ما في منشن', ephemeral: true });
                    return;
                }

                await interaction.followUp({ content: `تم ارسال الرساله الى ${sentTags.join(', ')}`, ephemeral: true });
            });
        }
    }
});

client.login(process.env.TOKEN);
