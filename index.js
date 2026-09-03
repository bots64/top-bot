const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('Bot is active and running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

const { Client, GatewayIntentBits, ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// إعدادات بوت التوب
const TXT_CHANNEL_ID = '1543093337165144084';
const VC_CHANNEL_ID = '1543093370065260564';
const ANON_CHANNEL_ID = '1543113579962835054';
const EXCLUDED_ROLE_ID = '1535875661997277194';
const ADMIN_ROLE_ID = '1544487320357572629';

// إعدادات بوت الـ AI
const TARGET_CHANNEL_ID = '1544964340916949052'; // الروم المستهدف للكتابة
const CATEGORIES = [
    '1544964105742585866',
    '1544964067876278272',
    '1544964686653431878',
    '1544964713803153418'
];

// تخزين الرومات النشطة للـ AI
const activeRooms = new Map();

const db = {
    messages: new Map(),       
    voiceMinutes: new Map(),   
    dailyMessages: new Map(),  
    dailyVoice: new Map(),
    cooldowns: new Map(),
    bannedUsers: new Set()     
};

function getTodayDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0];
}

let lastRecordedDate = getTodayDateString();

function checkDailyReset() {
    const currentDate = getTodayDateString();
    if (currentDate !== lastRecordedDate) {
        db.dailyMessages.clear();
        db.dailyVoice.clear();
        lastRecordedDate = currentDate;
        console.log('Daily stats have been reset for the new day.');
    }
}

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

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    checkDailyReset();
    const content = message.content.trim();

    // 1. أوامر بوت الـ AI: أمر الحذف delete room
    if (content.toLowerCase() === 'delete room') {
        const isAiRoom = Array.from(activeRooms.values()).includes(message.channel.id);
        if (isAiRoom) {
            try {
                await message.channel.delete();
                for (let [userId, chId] of activeRooms.entries()) {
                    if (chId === message.channel.id) {
                        activeRooms.delete(userId);
                        break;
                    }
                }
            } catch (err) {
                console.error('Error deleting room:', err);
            }
        }
        return;
    }

    // 2. أوامر الإدارية لبوت التوب
    if (content.startsWith('rest chat') || content.startsWith('rest voice') || content.startsWith('اعطاء') || content.startsWith('سحب') || content.startsWith('leve ') || content.startsWith('come ')) {
        
        if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
            await message.react('❌').catch(() => {});
            return;
        }

        if (content === 'rest chat') {
            db.messages.clear();
            db.dailyMessages.clear();
            await updateLeaderboards();
            await message.react('✅').catch(() => {});
            return;
        }

        if (content === 'rest voice') {
            db.voiceMinutes.clear();
            db.dailyVoice.clear();
            await updateLeaderboards();
            await message.react('✅').catch(() => {});
            return;
        }

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

            const currentMsg = db.messages.get(targetMember.id) || 0;
            db.messages.set(targetMember.id, currentMsg + amount);
            const currentVoice = db.voiceMinutes.get(targetMember.id) || 0;
            db.voiceMinutes.set(targetMember.id, currentVoice + amount);

            await updateLeaderboards();
            await message.react('✅').catch(() => {});
            return;
        }

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
            const currentVoice = db.voiceMinutes.get(targetMember.id) || 0;
            if (currentVoice >= amount) {
                db.voiceMinutes.set(targetMember.id, currentVoice - amount);
            }
            await updateLeaderboards();
            await message.react('✅').catch(() => {});
            return;
        }
    }

    // 3. التحقق من روم الـ AI الرئيسي لإنشاء الرومات الخاصة
    if (message.channel.id === TARGET_CHANNEL_ID) {
        try {
            await message.delete();
        } catch (err) {
            console.error('Failed to delete message:', err);
        }

        const userId = message.author.id;

        if (activeRooms.has(userId)) {
            const existingRoomId = activeRooms.get(userId);
            const existingRoom = message.guild.channels.cache.get(existingRoomId);

            if (existingRoom) {
                const warningMsg = await message.channel.send({
                    content: `<@${userId}> أنت عندك روم من قبل!`
                });
                setTimeout(() => warningMsg.delete().catch(() => {}), 4000);
                return;
            } else {
                activeRooms.delete(userId);
            }
        }

        let selectedCategory = null;
        for (const catId of CATEGORIES) {
            const category = message.guild.channels.cache.get(catId);
            if (category && category.type === ChannelType.GuildCategory) {
                const roomsCount = category.children.cache.size;
                if (roomsCount < 50) {
                    selectedCategory = catId;
                    break;
                }
            }
        }

        if (!selectedCategory) {
            selectedCategory = CATEGORIES[CATEGORIES.length - 1];
        }

        try {
            const channelName = `ai-${message.author.username}`;
            const newChannel = await message.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: selectedCategory,
                permissionOverwrites: [
                    {
                        id: message.guild.id,
                        deny: [PermissionsBitField.Flags.ViewChannel]
                    },
                    {
                        id: userId,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    },
                    {
                        id: client.user.id,
                        allow: [
                            PermissionsBitField.Flags.ViewChannel,
                            PermissionsBitField.Flags.SendMessages,
                            PermissionsBitField.Flags.ReadMessageHistory
                        ]
                    }
                ]
            });

            activeRooms.set(userId, newChannel.id);

            await newChannel.send({
                content: `<@${userId}> اسأل أي سؤال وأنا بخدمتك.`
            });

        } catch (err) {
            console.error('Error creating AI room:', err);
        }
        return;
    }

    // 4. التفاعل داخل رومات الـ AI الخاصة بالمستخدمين
    const isAiRoom = Array.from(activeRooms.values()).includes(message.channel.id);
    if (isAiRoom) {
        try {
            if (content.includes('السلام عليكم')) {
                await message.reply('وعليكم السلام ورحمة الله وبركاته، أهلاً بك! كيف يمكنني مساعدتك اليوم؟');
            } else if (content.toLowerCase().includes('استشارة')) {
                await message.reply('يلا عطني تفاصيل الاستشارة، أنا أسمعك وجاهز للمساعدة.');
            } else {
                await message.reply(`أهلاً بك، لقد تلقيت سؤالك وجاهز للإجابة عليه بدقة واحترافية.`);
            }
        } catch (err) {
            console.error('Error replying in AI room:', err);
        }
        return;
    }

    if (message.channel.isThread() || message.channel.type === 11 || message.channel.type === 12) return;
    if (message.channel.parent && message.channel.parent.type === 2) return;

    if (isExcluded(message.member)) return;
    
    // تسجيل تفاعل الرسائل لبوت التوب
    const userId = message.author.id;
    db.messages.set(userId, (db.messages.get(userId) || 0) + 1);
    db.dailyMessages.set(userId, (db.dailyMessages.get(userId) || 0) + 1);
});

const voiceTimers = new Map();

client.on('voiceStateUpdate', (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || isExcluded(member)) return;

    const userId = member.id;
    checkDailyReset();

    if (!oldState.channelId && newState.channelId) {
        voiceTimers.set(userId, Date.now());
    } else if (oldState.channelId && !newState.channelId) {
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

setInterval(() => {
    checkDailyReset();
    for (const [userId, joinTime] of voiceTimers.entries()) {
        const durationMins = Math.floor((Date.now() - joinTime) / 60000);
        if (durationMins >= 1) {
            db.voiceMinutes.set(userId, (db.voiceMinutes.get(userId) || 0) + 1);
            db.dailyVoice.set(userId, (db.dailyVoice.get(userId) || 0) + 1);
            voiceTimers.set(userId, Date.now());
        }
    }
}, 60000);

async function updateLeaderboards() {
    try {
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

            const fetchedMessages = await txtChannel.messages.fetch({ limit: 10 }).catch(() => null);
            if (fetchedMessages) {
                const botMessage = fetchedMessages.find(m => m.author.id === client.user.id);
                if (botMessage) {
                    await botMessage.edit({ embeds: [embed], components: [row] }).catch(async () => {
                        await botMessage.delete().catch(() => {});
                        await txtChannel.send({ embeds: [embed], components: [row] });
                    });
                } else {
                    await txtChannel.send({ embeds: [embed], components: [row] });
                }
            } else {
                await txtChannel.send({ embeds: [embed], components: [row] });
            }
        }

        const vcChannel = await client.channels.fetch(VC_CHANNEL_ID).catch(() => null);
        if (vcChannel) {
            const embed = new EmbedBuilder()
                .setTitle('Top Voice')
                .setColor('#1e1f22')
                .setDescription(getTopVoiceText())
                .setFooter({ text: 'Updated 30 seconds ago' });

            const fetchedMessages = await vcChannel.messages.fetch({ limit: 10 }).catch(() => null);
            if (fetchedMessages) {
                const botMessage = fetchedMessages.find(m => m.author.id === client.user.id);
                if (botMessage) {
                    await botMessage.edit({ embeds: [embed] }).catch(async () => {
                        await botMessage.delete().catch(() => {});
                        await vcChannel.send({ embeds: [embed] });
                    });
                } else {
                    await vcChannel.send({ embeds: [embed] });
                }
            } else {
                await vcChannel.send({ embeds: [embed] });
            }
        }

        const anonChannel = await client.channels.fetch(ANON_CHANNEL_ID).catch(() => null);
        if (anonChannel) {
            const messages = await anonChannel.messages.fetch({ limit: 10 }).catch(() => null);
            const botMessage = messages ? messages.find(m => m.author.id === client.user.id) : null;
            
            const embed = new EmbedBuilder()
                .setColor('#1e1f22')
                .setDescription('اكتب رسالتك بسرية تامة وكل شي محفوظ هنا');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('anonymous_msg_btn').setLabel('رسالة من مجهول').setStyle(ButtonStyle.Secondary)
            );

            if (botMessage) {
                await botMessage.edit({ embeds: [embed], components: [row] }).catch(async () => {
                    await botMessage.delete().catch(() => {});
                    await anonChannel.send({ embeds: [embed], components: [row] });
                });
            } else {
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

client.on('interactionCreate', async interaction => {
    if (interaction.isButton()) {
        if (interaction.customId === 'my_stats_txt') {
            await interaction.deferReply({ ephemeral: true });
            checkDailyReset();
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
                new ButtonBuilder().setCustomId('hide_identity').setLabel('اخفاء الهويه').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('reveal_identity').setLabel('اظهار الهويه').setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({
                components: [row],
                ephemeral: true
            });
        }

        if (interaction.customId === 'hide_identity' || interaction.customId === 'reveal_identity') {
            const isReveal = interaction.customId === 'reveal_identity';
            const modalId = isReveal ? 'modal_reveal' : 'modal_hide';

            const modal = new ModalBuilder()
                .setCustomId(modalId)
                .setTitle('رسالة من مجهول');

            const targetInput = new TextInputBuilder()
                .setCustomId('target_user')
                .setLabel('اكتب يوزرات الأشخاص (بينهم مسافات)')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('منشنات، ايديات، أو يوزرات مفصولة بمسافة')
                .setRequired(true);

            const msgInput = new TextInputBuilder()
                .setCustomId('message_content')
                .setLabel('اكتب رسالتك بسرية')
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('اكتب رسالتك هنا...')
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(targetInput),
                new ActionRowBuilder().addComponents(msgInput)
            );

            await interaction.showModal(modal);
        }
    } else if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_hide' || interaction.customId === 'modal_reveal') {
            await interaction.deferReply({ ephemeral: true });

            const isReveal = interaction.customId === 'modal_reveal';
            const rawTargetInput = interaction.fields.getTextInputValue('target_user').trim();
            const messageText = interaction.fields.getTextInputValue('message_content').trim();

            const inviteRegex = /(discord\.(gg|com\/invite)\/[a-zA-Z0-9]+|discord\.app\/invite\/[a-zA-Z0-9]+|discord\.me\/[a-zA-Z0-9]+)/i;
            if (inviteRegex.test(messageText)) {
                await interaction.editReply({ content: 'لم يتم إرسال الرسالة إلى الشخص أو الأشخاص المطلوبين لأنه يوجد هناك رابط لسيرفر.' });
                return;
            }

            const userId = interaction.user.id;
            db.cooldowns.set(userId, Date.now());

            const targetIds = new Set();
            const matches = rawTargetInput.matchAll(/<@!?(\d+)>|(\d{17,19})/g);
            for (const match of matches) {
                const id = match[1] || match[2];
                if (id) targetIds.add(id);
            }

            const tokens = rawTargetInput.split(/\s+/);
            const members = await interaction.guild.members.fetch().catch(() => null);

            if (members) {
                for (const token of tokens) {
                    const cleanToken = token.replace('@', '').toLowerCase();
                    if (!cleanToken) continue;

                    const found = members.find(m => 
                        m.user.username.toLowerCase() === cleanToken || 
                        (m.nickname && m.nickname.toLowerCase() === cleanToken) || 
                        m.user.tag.toLowerCase() === cleanToken
                    );
                    
                    if (found) {
                        targetIds.add(found.id);
                    }
                }
            }

            if (targetIds.size === 0) {
                await interaction.editReply({ content: 'هذا الشخص أو الأشخاص غير موجودين في السيرفر' });
                return;
            }

            const senderDisplay = isReveal ? `<@${userId}>` : 'مجهول الهوية';
            let sentCount = 0;
            let notFoundCount = 0;

            for (const targetId of targetIds) {
                const targetMember = interaction.guild.members.cache.get(targetId) || await interaction.guild.members.fetch(targetId).catch(() => null);
                if (!targetMember || targetMember.user.bot) {
                    notFoundCount++;
                    continue;
                }

                try {
                    await targetMember.send(`**عندك رسالة من مجهول**\nالرسالة : ${messageText}\nالراسل : ${senderDisplay}`);
                    sentCount++;
                } catch (err) {
                    notFoundCount++;
                }
            }

            if (sentCount === 0) {
                await interaction.editReply({ content: 'هذا الشخص غير موجود في السيرفر أو أن خاصه مغلق' });
                return;
            }

            let replyMsg = `تم إرسال الرسالة إلى الشخص أو الأشخاص المطلوبين`;
            if (notFoundCount > 0) {
                replyMsg += ` (بعض الأشخاص لم يتم إرسال الرسالة لهم لعدم وجودهم أو إغلاق الخاص)`;
            }

            await interaction.editReply({ content: replyMsg });
        }
    }
});

client.login(process.env.TOKEN);
