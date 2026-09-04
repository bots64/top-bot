const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('Bot is active and running!');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is listening on port ${PORT}`);
});

const { 
    Client, 
    GatewayIntentBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    ChannelType,
    PermissionsBitField 
} = require('discord.js');

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

const SECRET_ROOM_PANEL_ID = '1545231229312573450';
const SECRET_ROOM_CONTROL_ID = '1545233055969443901';

const EXCLUDED_ROLE_ID = '1535875661997277194';
const ADMIN_ROLE_ID = '1544487320357572629';

const db = {
    messages: new Map(),       
    voiceMinutes: new Map(),   
    dailyMessages: new Map(),  
    dailyVoice: new Map(),
    cooldowns: new Map(),
    bannedUsers: new Set(),
    secretRooms: new Map(),
    secretInvites: new Map()
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
    await setupSecretRoomPanels();
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

    if (message.channel.isThread() || message.channel.type === 11 || message.channel.type === 12) return;
    if (message.channel.parent && message.channel.parent.type === 2) return;

    if (isExcluded(message.member)) return;
    
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

async function setupSecretRoomPanels() {
    try {
        const panelChannel = await client.channels.fetch(SECRET_ROOM_PANEL_ID).catch(() => null);
        if (panelChannel) {
            const messages = await panelChannel.messages.fetch({ limit: 10 }).catch(() => null);
            const botMsg = messages ? messages.find(m => m.author.id === client.user.id) : null;
            
            const embed = new EmbedBuilder()
                .setColor('#1e1f22')
                .setDescription('سو رومك مع من تحب');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('create_secret_room_btn').setLabel('انشاء روم').setStyle(ButtonStyle.Secondary)
            );

            if (botMsg) {
                await botMsg.edit({ embeds: [embed], components: [row] }).catch(async () => {
                    await botMsg.delete().catch(() => {});
                    await panelChannel.send({ embeds: [embed], components: [row] });
                });
            } else {
                await panelChannel.send({ embeds: [embed], components: [row] });
            }
        }

        const controlChannel = await client.channels.fetch(SECRET_ROOM_CONTROL_ID).catch(() => null);
        if (controlChannel) {
            const messages = await controlChannel.messages.fetch({ limit: 10 }).catch(() => null);
            const botMsg = messages ? messages.find(m => m.author.id === client.user.id) : null;
            
            const embed = new EmbedBuilder()
                .setColor('#1e1f22')
                .setTitle('Choose a leader action');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('sr_kick').setLabel('Kick Member').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('sr_add').setLabel('Invite Member').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('sr_rename').setLabel('Edit Role').setStyle(ButtonStyle.Secondary)
            );

            if (botMsg) {
                await botMsg.edit({ embeds: [embed], components: [row] }).catch(async () => {
                    await botMsg.delete().catch(() => {});
                    await controlChannel.send({ embeds: [embed], components: [row] });
                });
            } else {
                await controlChannel.send({ embeds: [embed], components: [row] });
            }
        }
    } catch (err) {
        console.error('Error setupSecretRoomPanels:', err);
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

        if (interaction.customId === 'create_secret_room_btn') {
            const userId = interaction.user.id;
            if (db.secretRooms.has(userId)) {
                await interaction.reply({ content: 'لديك روم سري مسبقاً!', ephemeral: true });
                return;
            }

            const modal = new ModalBuilder()
                .setCustomId('modal_create_secret_room')
                .setTitle('انشاء روم');

            const targetInput = new TextInputBuilder()
                .setCustomId('target_users')
                .setLabel('اكتب يوزرات الشخص أو الأشخاص')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('اكتب يوزراتهم ولا تشيل هم')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(targetInput));
            await interaction.showModal(modal);
        }

        if (['sr_kick', 'sr_add', 'sr_rename'].includes(interaction.customId)) {
            const userId = interaction.user.id;
            const roomData = db.secretRooms.get(userId);
            if (!roomData) {
                await interaction.reply({ content: 'هذا الروم لازم لا يقول لازم تسوي روم مخفي قبل بالرسالة الزرقاء التي ما تشوف إلا هو.', ephemeral: true });
                return;
            }

            const modal = new ModalBuilder();
            if (interaction.customId === 'sr_kick') {
                modal.setCustomId('modal_sr_kick').setTitle('طرد عضو');
                const tInput = new TextInputBuilder()
                    .setCustomId('kick_target')
                    .setLabel('اكتب يوزر الشخص أو الأشخاص المراد طردهم أو آيديهم')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('اكتب يوزر أو آيدي')
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(tInput));
            } else if (interaction.customId === 'sr_add') {
                modal.setCustomId('modal_sr_add').setTitle('إضافة عضو');
                const tInput = new TextInputBuilder()
                    .setCustomId('add_target')
                    .setLabel('اكتب يوزر أو يوزرات الأشخاص المراد إضافتهم')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('اكتب يوزرهم ولا تتردد')
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(tInput));
            } else if (interaction.customId === 'sr_rename') {
                modal.setCustomId('modal_sr_rename').setTitle('تعديل اسم الروم');
                const tInput = new TextInputBuilder()
                    .setCustomId('new_name')
                    .setLabel('اكتب الاسم الجديد للروم')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('اكتب الاسم الجديد فقط بدون إضافات')
                    .setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(tInput));
            }

            await interaction.showModal(modal);
        }

        if (interaction.customId.startsWith('accept_sr_') || interaction.customId.startsWith('reject_sr_')) {
            await interaction.deferReply({ ephemeral: true });
            const inviteKey = interaction.customId.replace('accept_sr_', '').replace('reject_sr_', '');
            const inviteInfo = db.secretInvites.get(inviteKey);

            if (!inviteInfo) {
                await interaction.editReply({ content: 'هذه الدعوة منتهية أو غير صالحة.' });
                return;
            }

            const userId = interaction.user.id;
            const roomData = db.secretRooms.get(inviteInfo.ownerId);

            if (!roomData) {
                await interaction.editReply({ content: 'الروم لم يعد موجوداً.' });
                return;
            }

            if (interaction.customId.startsWith('reject_sr_')) {
                if (roomData.pending) roomData.pending.delete(userId);
                db.secretInvites.delete(inviteKey);
                await interaction.editReply({ content: 'تم رفض الدعوة' });
                return;
            }

            if (roomData.pending) roomData.pending.delete(userId);
            roomData.members.add(userId);
            db.secretInvites.delete(inviteKey);

            const channel = interaction.guild.channels.cache.get(roomData.channelId);
            if (channel) {
                await channel.permissionOverwrites.edit(userId, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                }).catch(() => {});
            }

            await interaction.editReply({ content: 'تم انضمامك للروم السري' });
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

        if (interaction.customId === 'modal_create_secret_room') {
            await interaction.deferReply({ ephemeral: true });
            const userId = interaction.user.id;
            const rawInput = interaction.fields.getTextInputValue('target_users').trim();

            const targetIds = new Set();
            const matches = rawInput.matchAll(/<@!?(\d+)>|(\d{17,19})/g);
            for (const match of matches) {
                const id = match[1] || match[2];
                if (id && id !== userId) targetIds.add(id);
            }

            const tokens = rawInput.split(/\s+/);
            const members = await interaction.guild.members.fetch().catch(() => null);

            if (members) {
                for (const token of tokens) {
                    const cleanToken = token.replace('@', '').toLowerCase();
                    if (!cleanToken) continue;

                    const found = members.find(m => 
                        (m.user.username.toLowerCase() === cleanToken || 
                        (m.nickname && m.nickname.toLowerCase() === cleanToken) || 
                        m.user.tag.toLowerCase() === cleanToken) && m.id !== userId
                    );
                    
                    if (found) {
                        targetIds.add(found.id);
                    }
                }
            }

            if (targetIds.size > 150) {
                await interaction.editReply({ content: 'العدد كثير جداً أعلى حد 150 هذا لو أحد بغى يعطيهم.' });
                return;
            }

            if (targetIds.size === 0) {
                await interaction.editReply({ content: 'العدد غير كافي أو اليوزر غير صحيح أو ليس في السيرفر.' });
                return;
            }

            const ownerMember = interaction.guild.members.cache.get(userId);
            const roomName = `room-${ownerMember.user.username}`;

            const guild = interaction.guild;
            const secretChannel = await guild.channels.create({
                name: roomName,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    {
                        id: guild.id,
                        deny: [PermissionsBitField.Flags.ViewChannel]
                    },
                    {
                        id: userId,
                        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
                    },
                    {
                        id: client.user.id,
                        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels]
                    }
                ]
            }).catch(() => null);

            if (!secretChannel) {
                await interaction.editReply({ content: 'حدث خطأ أثناء إنشاء الروم.' });
                return;
            }

            if (ADMIN_ROLE_ID) {
                await secretChannel.permissionOverwrites.edit(ADMIN_ROLE_ID, {
                    ViewChannel: true,
                    SendMessages: true,
                    ReadMessageHistory: true
                }).catch(() => {});
            }

            const membersSet = new Set([userId]);
            const pendingSet = new Set();

            const invitedMentionsList = [];
            invitedMentionsList.push(`<@${userId}>`);

            for (const tId of targetIds) {
                const mem = guild.members.cache.get(tId);
                if (!mem) continue;
                pendingSet.add(tId);
                invitedMentionsList.push(`<@${tId}>`);
            }

            db.secretRooms.set(userId, {
                channelId: secretChannel.id,
                members: membersSet,
                pending: pendingSet
            });

            // تم تصحيح الخطأ هنا في توليد مفتاح الدعوة
            const inviteKey = Math.random().toString(36).substring(2, 9);
            db.secretInvites.set(inviteKey, {
                ownerId: userId,
                channelId: secretChannel.id
            });

            const inviteText = `لديك دعوة من شخص\nللانضمام للروم السري مع (${invitedMentionsList.join(', ')})`;

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId(`accept_sr_${inviteKey}`).setLabel('قبول').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId(`reject_sr_${inviteKey}`).setLabel('رفض').setStyle(ButtonStyle.Danger)
            );

            for (const tId of targetIds) {
                const mem = guild.members.cache.get(tId);
                if (mem) {
                    await mem.send({ content: inviteText, components: [row] }).catch(() => {});
                }
            }

            await interaction.editReply({ content: `تم إنشاء الروم السري بنجاح وتم إرسال الدعوات للأشخاص (الحد الأقصى 150). الروم المخفي: <#${secretChannel.id}>` });
        }

        if (interaction.customId === 'modal_sr_kick') {
            await interaction.deferReply({ ephemeral: true });
            const userId = interaction.user.id;
            const roomData = db.secretRooms.get(userId);
            const rawInput = interaction.fields.getTextInputValue('kick_target').trim();

            const targetIds = new Set();
            const matches = rawInput.matchAll(/<@!?(\d+)>|(\d{17,19})/g);
            for (const match of matches) {
                const id = match[1] || match[2];
                if (id) targetIds.add(id);
            }

            const members = await interaction.guild.members.fetch().catch(() => null);
            if (members) {
                const tokens = rawInput.split(/\s+/);
                for (const token of tokens) {
                    const cleanToken = token.replace('@', '').toLowerCase();
                    if (!cleanToken) continue;
                    const found = members.find(m => 
                        m.user.username.toLowerCase() === cleanToken || 
                        (m.nickname && m.nickname.toLowerCase() === cleanToken) || 
                        m.user.tag.toLowerCase() === cleanToken
                    );
                    if (found) targetIds.add(found.id);
                }
            }

            if (targetIds.size === 0) {
                await interaction.editReply({ content: 'المنشن غير صحيح' });
                return;
            }

            const secretChannel = interaction.guild.channels.cache.get(roomData.channelId);
            let kickedAny = false;

            for (const tId of targetIds) {
                if (roomData.members.has(tId) || roomData.pending.has(tId)) {
                    roomData.members.delete(tId);
                    roomData.pending.delete(tId);
                    kickedAny = true;

                    if (secretChannel) {
                        await secretChannel.permissionOverwrites.delete(tId).catch(() => {});
                    }
                }
            }

            if (kickedAny) {
                await interaction.editReply({ content: 'تم طرده ويصير هذاك الشخص ما عاد يقدر يشوف الروم، ولا يقدر يسوي في الروم شيء.' });
            } else {
                await interaction.editReply({ content: 'هذا الشخص ليس بالروم أو ليس بالسيرفر' });
            }
        }

        if (interaction.customId === 'modal_sr_add') {
            await interaction.deferReply({ ephemeral: true });
            const userId = interaction.user.id;
            const roomData = db.secretRooms.get(userId);
            const rawInput = interaction.fields.getTextInputValue('add_target').trim();

            const targetIds = new Set();
            const matches = rawInput.matchAll(/<@!?(\d+)>|(\d{17,19})/g);
            for (const match of matches) {
                const id = match[1] || match[2];
                if (id) targetIds.add(id);
            }

            const members = await interaction.guild.members.fetch().catch(() => null);
            if (members) {
                const tokens = rawInput.split(/\s+/);
                for (const token of tokens) {
                    const cleanToken = token.replace('@', '').toLowerCase();
                    if (!cleanToken) continue;
                    const found = members.find(m => 
                        m.user.username.toLowerCase() === cleanToken || 
                        (m.nickname && m.nickname.toLowerCase() === cleanToken) || 
                        m.user.tag.toLowerCase() === cleanToken
                    );
                    if (found) targetIds.add(found.id);
                }
            }

            if (roomData.members.size + targetIds.size > 150) {
                await interaction.editReply({ content: 'العدد كثير جداً، الحد الأقصى المسموح بالروم هو 150 شخصاً.' });
                return;
            }

            if (targetIds.size === 0) {
                await interaction.editReply({ content: 'المنشن أو اليوزر غير صحيح أو ليس في السيرفر.' });
                return;
            }

            const guild = interaction.guild;
            const secretChannel = guild.channels.cache.get(roomData.channelId);

            for (const tId of targetIds) {
                roomData.pending.add(tId);
                const inviteKey = Math.random().toString(36).substring(2, 9);
                db.secretInvites.set(inviteKey, {
                    ownerId: userId,
                    channelId: secretChannel.id
                });

                const mem = guild.members.cache.get(tId);
                if (mem) {
                    const row = new ActionRowBuilder().addComponents(
                        new ButtonBuilder().setCustomId(`accept_sr_${inviteKey}`).setLabel('قبول').setStyle(ButtonStyle.Success),
                        new ButtonBuilder().setCustomId(`reject_sr_${inviteKey}`).setLabel('رفض').setStyle(ButtonStyle.Danger)
                    );
                    await mem.send({ content: `لديك دعوة من شخص\nللانضمام للروم السري`, components: [row] }).catch(() => {});
                }
            }

            await interaction.editReply({ content: 'ثم أضفت الشخص للروم (أرسلت له دعوة في الخاص لينضم).' });
        }

        if (interaction.customId === 'modal_sr_rename') {
            await interaction.deferReply({ ephemeral: true });
            const userId = interaction.user.id;
            const roomData = db.secretRooms.get(userId);
            const newName = interaction.fields.getTextInputValue('new_name').trim();

            if (!newName) {
                await interaction.editReply({ content: 'الاسم غير صحيح.' });
                return;
            }

            const secretChannel = interaction.guild.channels.cache.get(roomData.channelId);
            if (secretChannel) {
                await secretChannel.setName(newName).catch(() => {});
            }

            await interaction.editReply({ content: `تم تعديل اسم الروم بنجاح إلى: **${newName}**` });
        }
    }
});

client.login(process.env.TOKEN);
