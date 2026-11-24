
import { useEffect, useLayoutEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    ScrollView, Image, Alert, StyleSheet,
    KeyboardAvoidingView, Platform, Modal, Pressable, AppState
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useTheme } from '../context/ThemeContext';

const API = 'http://10.7.30.107:3000';
const AUTH = 'Basic Ayushmaan:54321';
const REACTIONS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

export default function ChatScreen({ route }) {
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState('');
    const [userId, setUserId] = useState('');
    const [sending, setSending] = useState(false);
    const [replyTo, setReplyTo] = useState(null);
    const [reactionTarget, setReactionTarget] = useState(null);
    const [actionTarget, setActionTarget] = useState(null);
    const scrollRef = useRef(null);
    const messageLayouts = useRef({});
    const messageScroll = useRef({ offset: 0, viewportHeight: 0 });
    const hasPositionedList = useRef(false);
    const messagesRef = useRef(messages);
    const locallySentMessages = useRef(new Map());
    const sendingRequest = useRef(false);
    const fetchingMessages = useRef(false);
    const reactionVersions = useRef({});
    const pendingReactionRequests = useRef({});
    const reactionState = useRef({});
    const statusVersions = useRef({});
    const pendingStatusAcks = useRef({});
    const statusAckErrors = useRef({});
    const statusState = useRef({});
    const isFocused = useIsFocused();
    const isFocusedRef = useRef(isFocused);

    useLayoutEffect(() => {
        messagesRef.current = messages;
    }, [messages]);
    useLayoutEffect(() => {
        isFocusedRef.current = isFocused;
    }, [isFocused]);

    const { name, conversationId, participants } = route.params.data;

    const getMessages = useCallback(async () => {
        if (fetchingMessages.current) return null;
        fetchingMessages.current = true;
        const requestedVersions = { ...reactionVersions.current };
        const pendingAtRequest = { ...pendingReactionRequests.current };
        const requestedStatusVersions = { ...statusVersions.current };
        const statusPendingAtRequest = { ...pendingStatusAcks.current };
        try {
            const res = await fetch(
                `${API}/message?conversation_id=${conversationId}`,
                { headers: { Authorization: AUTH } }
            );
            if (!res.ok) throw new Error(`Failed to load messages (HTTP ${res.status})`);

            const data = await res.json();
            const incomingMessages = Array.isArray(data) ? data : data.data || [];
            const incomingIds = new Set(incomingMessages.map(item => item.id));
            incomingMessages.forEach(item => locallySentMessages.current.delete(item.id));
            setMessages(current => {
                const currentMessages = new Map(current.map(item => [item.id, item]));
                const refreshedMessages = incomingMessages.map(item => {
                    const currentMessage = currentMessages.get(item.id);
                    const reactionsChanged = (reactionVersions.current[item.id] || 0) >
                        (requestedVersions[item.id] || 0);
                    const shouldKeepLocalReactions = pendingAtRequest[item.id] ||
                        pendingReactionRequests.current[item.id] ||
                        reactionsChanged;
                    const reactions = shouldKeepLocalReactions
                        ? reactionState.current[item.id] ?? currentMessage?.reactions ?? []
                        : item.reactions ?? [];
                    const statusChanged = (statusVersions.current[item.id] || 0) >
                        (requestedStatusVersions[item.id] || 0);
                    const shouldKeepLocalStatus = statusPendingAtRequest[item.id] ||
                        pendingStatusAcks.current[item.id] ||
                        statusChanged;
                    const status = shouldKeepLocalStatus
                        ? statusState.current[item.id] ?? currentMessage?.status ?? item.status
                        : item.status;

                    reactionState.current[item.id] = reactions;
                    statusState.current[item.id] = status;
                    return { ...item, reactions, status };
                });
                const localMessagesNotInResponse = [...locallySentMessages.current.values()]
                    .filter(item => !incomingIds.has(item.id));
                return [...refreshedMessages, ...localMessagesNotInResponse].sort((a, b) =>
                    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
                );
            });
            return incomingMessages;
        } finally {
            fetchingMessages.current = false;
        }
    }, [conversationId]);

    const acknowledgeMessage = useCallback(async (item, acknowledgement) => {
        if (!userId || item.senderId === userId) return;

        const currentStatus = statusState.current[item.id] ?? item.status ?? {};
        const ownStatus = currentStatus[userId] ?? {};
        if ((acknowledgement === 'delivered' && ownStatus.delivered) ||
            (acknowledgement === 'read' && ownStatus.read)) return;
        if (pendingStatusAcks.current[item.id] === 'read' ||
            pendingStatusAcks.current[item.id] === acknowledgement) return;

        const version = (statusVersions.current[item.id] || 0) + 1;
        statusVersions.current[item.id] = version;
        pendingStatusAcks.current[item.id] = acknowledgement;

        try {
            const res = await fetch(`${API}/message/acknowledge`, {
                method: 'POST',
                headers: {
                    Authorization: AUTH,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    conversation_id: conversationId,
                    message_id: item.id,
                    status: acknowledgement
                })
            });
            if (!res.ok) {
                throw new Error(`Message status update failed (HTTP ${res.status})`);
            }

            const data = await res.json();
            if (!data.status || typeof data.status !== 'object' || Array.isArray(data.status)) {
                throw new Error('Invalid message status response');
            }

            delete statusAckErrors.current[`${item.id}:${acknowledgement}`];
            if (statusVersions.current[item.id] === version) {
                statusState.current[item.id] = data.status;
                setMessages(current => current.map(message =>
                    message.id === item.id ? { ...message, status: data.status } : message
                ));
            }
        } catch (err) {
            const errorKey = `${item.id}:${acknowledgement}`;
            if (!statusAckErrors.current[errorKey]) {
                statusAckErrors.current[errorKey] = true;
                Alert.alert('Message status update failed', err.message);
            }
        } finally {
            if (statusVersions.current[item.id] === version) {
                delete pendingStatusAcks.current[item.id];
            }
        }
    }, [conversationId, userId]);

    const appendSavedMessage = (savedMessage, quotedMessage = null) => {
        if (!savedMessage?.id) throw new Error('The server did not return the saved message');

        const messageToAdd = {
            ...savedMessage,
            reactions: savedMessage.reactions ?? [],
            status: savedMessage.status ?? {},
            replyTo: savedMessage.replyTo ?? (quotedMessage ? {
                id: quotedMessage.id,
                content: quotedMessage.content,
                imageInfo: quotedMessage.imageInfo,
                senderId: quotedMessage.senderId,
                senderName: quotedMessage.senderName
            } : null)
        };
        reactionState.current[messageToAdd.id] = messageToAdd.reactions;
        statusState.current[messageToAdd.id] = messageToAdd.status;
        locallySentMessages.current.set(messageToAdd.id, messageToAdd);
        setMessages(current => {
            if (current.some(item => item.id === messageToAdd.id)) return current;
            return [...current, messageToAdd].sort((a, b) =>
                new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
            );
        });
    };

    const checkVisibleMessages = useCallback(() => {
        if (!hasPositionedList.current || !userId ||
            !isFocusedRef.current || AppState.currentState !== 'active') return;
        const { offset, viewportHeight } = messageScroll.current;
        if (!viewportHeight) return;

        const visibleBottom = offset + viewportHeight;
        for (const [id, layout] of Object.entries(messageLayouts.current)) {
            if (layout.y + layout.height <= offset || layout.y >= visibleBottom) continue;
            const item = messagesRef.current.find(message => message.id === id);
            if (item && item.senderId !== userId && !item.status?.[userId]?.read) {
                void acknowledgeMessage(item, 'read');
            }
        }
    }, [acknowledgeMessage, userId]);

    const messagePreview = item =>
        item.content?.trim() || (item.imageInfo ? 'Photo' : 'Message');

    const scrollToMessage = id => {
        const layout = messageLayouts.current[id];
        if (layout) {
            scrollRef.current?.scrollTo({ y: layout.y, animated: true });
        } else {
            Alert.alert('Message not loaded', 'The original message is not in this chat page.');
        }
    };

    useEffect(() => {
        let mounted = true;
        const loadCurrentUser = async () => {
            try {
                const res = await fetch(`${API}/user/profile`, {
                    headers: { Authorization: AUTH }
                });
                if (!res.ok) throw new Error(`Failed to load current user (HTTP ${res.status})`);
                const profile = await res.json();
                if (!profile.id) throw new Error('Current user response did not contain an ID');
                if (mounted) {
                    setUserId(profile.id);
                }
            } catch (err) {
                if (mounted) Alert.alert('Error', err.message);
            }
        };

        loadCurrentUser();
        return () => {
            mounted = false;
        };
    }, []);

    useEffect(() => {
        if (!isFocused || !userId) return undefined;
        let active = true;
        let loadErrorShown = false;
        const refresh = async () => {
            if (!active || !isFocusedRef.current || AppState.currentState !== 'active') return;
            try {
                const incomingMessages = await getMessages();
                if (!incomingMessages) return;
                await Promise.all(incomingMessages
                    .filter(item => item.senderId !== userId && !item.status?.[userId]?.delivered)
                    .map(item => acknowledgeMessage(item, 'delivered')));
            } catch (err) {
                if (!loadErrorShown) {
                    loadErrorShown = true;
                    Alert.alert('Error', err.message);
                }
            }
        };

        refresh();
        const interval = setInterval(refresh, 4000);
        const subscription = AppState.addEventListener('change', state => {
            if (state === 'active') {
                refresh();
                checkVisibleMessages();
            }
        });
        return () => {
            active = false;
            clearInterval(interval);
            subscription.remove();
        };
    }, [acknowledgeMessage, checkVisibleMessages, getMessages, isFocused, userId]);

    const sendMessage = async () => {
        const content = message.trim();
        if (!content || sendingRequest.current) return;

        const selectedReply = replyTo;
        sendingRequest.current = true;
        setSending(true);
        try {
            const res = await fetch(`${API}/message`, {
                method: 'POST',
                headers: {
                    Authorization: AUTH,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    conversation_id: conversationId,
                    content,
                    ...(selectedReply ? { replyToId: selectedReply.id } : {})
                })
            });

            if (!res.ok) throw new Error(`Message sending failed (HTTP ${res.status})`);

            const savedMessage = await res.json();
            appendSavedMessage(savedMessage, selectedReply);
            setMessage(current => current === message ? '' : current);
            setReplyTo(current => current?.id === selectedReply?.id ? null : current);
        } catch (err) {
            Alert.alert('Error', err.message);
        } finally {
            sendingRequest.current = false;
            setSending(false);
        }
    };

    const toggleReaction = async (item, emoji) => {
        setReactionTarget(null);
        if (pendingReactionRequests.current[item.id]) return;

        const version = (reactionVersions.current[item.id] || 0) + 1;
        reactionVersions.current[item.id] = version;
        pendingReactionRequests.current[item.id] = true;
        const previousReactions = reactionState.current[item.id] ?? item.reactions ?? [];
        const currentReaction = previousReactions.find(reaction => reaction.userId === userId);
        const otherReactions = previousReactions.filter(reaction => reaction.userId !== userId);
        const optimisticReactions = currentReaction?.reaction === emoji
            ? otherReactions
            : [...otherReactions, { userId, reaction: emoji }];

        reactionState.current[item.id] = optimisticReactions;
        setMessages(current => current.map(message =>
            message.id === item.id
                ? { ...message, reactions: optimisticReactions }
                : message
        ));

        try {
            const res = await fetch(`${API}/message/reaction`, {
                method: 'POST',
                headers: {
                    Authorization: AUTH,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ message_id: item.id, reaction: emoji })
            });

            if (!res.ok) throw new Error('Reaction update failed');

            const data = await res.json();
            if (!Array.isArray(data.reactions)) {
                throw new Error('Invalid reaction response');
            }

            if (reactionVersions.current[item.id] === version) {
                reactionState.current[item.id] = data.reactions;
                setMessages(current => current.map(message =>
                    message.id === item.id
                        ? { ...message, reactions: data.reactions }
                        : message
                ));
            }
        } catch (err) {
            if (reactionVersions.current[item.id] === version) {
                reactionState.current[item.id] = previousReactions;
                setMessages(current => current.map(message =>
                    message.id === item.id
                        ? { ...message, reactions: previousReactions }
                        : message
                ));
            }
            Alert.alert('Error', err.message);
        } finally {
            if (reactionVersions.current[item.id] === version) {
                delete pendingReactionRequests.current[item.id];
            }
        }
    };

    const pickImage = async () => {
        try {
            const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (!permission.granted) return Alert.alert('Permission required');

            const result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ['images'],
                quality: 0.7,
                base64: true
            });

            if (result.canceled) return;

            const res = await fetch(`${API}/message`, {
                method: 'POST',
                headers: {
                    Authorization: AUTH,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    conversation_id: conversationId,
                    imageInfo: result.assets[0].base64
                })
            });

            if (!res.ok) throw new Error(`Image sending failed (HTTP ${res.status})`);
            appendSavedMessage(await res.json());
        } catch (err) {
            Alert.alert('Error', err.message);
        }
    };

    return (
        <>
            <KeyboardAvoidingView
                style={styles.container}
                behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            >
                <View style={styles.header}>
                    <Text style={styles.title}>{name}</Text>
                    <Text style={styles.subtitle}>
                        {participants.length} participants
                    </Text>
                </View>

                <ScrollView
                    ref={scrollRef}
                    style={styles.messageList}
                    contentContainerStyle={styles.messages}
                    keyboardShouldPersistTaps="handled"
                    onLayout={event => {
                        messageScroll.current.viewportHeight = event.nativeEvent.layout.height;
                        scrollRef.current?.scrollToEnd({ animated: true });
                    }}
                    onScroll={event => {
                        messageScroll.current.offset = event.nativeEvent.contentOffset.y;
                        hasPositionedList.current = true;
                        checkVisibleMessages();
                    }}
                    scrollEventThrottle={250}
                    onContentSizeChange={(...dimensions) => {
                        const height = dimensions[1];
                        if (height <= messageScroll.current.viewportHeight) {
                            hasPositionedList.current = true;
                            checkVisibleMessages();
                        } else {
                            scrollRef.current?.scrollToEnd({ animated: true });
                        }
                    }}
                >
                    {messages.map((item, index) => {
                        const mine = item.senderId === userId;
                        const recipientStatuses = participants
                            .filter(participantId => participantId !== userId)
                            .map(participantId => item.status?.[participantId]);
                        const delivered = recipientStatuses.length > 0 &&
                            recipientStatuses.every(status => status?.delivered);
                        const read = recipientStatuses.length > 0 &&
                            recipientStatuses.every(status => status?.read);
                        const timestamp = item.createdAt
                            ? new Date(item.createdAt).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit'
                            })
                            : '';
                        const image = item.imageInfo
                            ? item.imageInfo.startsWith('data:')
                                ? item.imageInfo
                                : `data:image/jpeg;base64,${item.imageInfo}`
                            : null;
                        const reactionGroups = (Array.isArray(item.reactions) ? item.reactions : [])
                            .reduce((groups, reaction) => {
                                let group = groups.find(value => value.emoji === reaction.reaction);
                                if (!group) {
                                    group = { emoji: reaction.reaction, count: 0, selected: false };
                                    groups.push(group);
                                }
                                group.count += 1;
                                if (reaction.userId === userId) group.selected = true;
                                return groups;
                            }, []);

                        return (
                            <View
                                key={item.id || index}
                                onLayout={event => {
                                    if (item.id) {
                                        messageLayouts.current[item.id] = {
                                            y: event.nativeEvent.layout.y,
                                            height: event.nativeEvent.layout.height
                                        };
                                        checkVisibleMessages();
                                    }
                                }}
                                style={[
                                    styles.row,
                                    { justifyContent: mine ? 'flex-end' : 'flex-start' }
                                ]}
                            >
                                <View style={[styles.messageContent, mine ? styles.messageContentMine : styles.messageContentOther]}>
                                    <TouchableOpacity
                                        activeOpacity={1}
                                        delayLongPress={300}
                                        onLongPress={() => setActionTarget(item)}
                                        style={[
                                            styles.bubble,
                                            { backgroundColor: mine ? colors.sentBubble : colors.receivedBubble }
                                        ]}
                                    >
                                        {item.replyTo && (
                                            <TouchableOpacity
                                                style={styles.quotedMessage}
                                                onPress={() => scrollToMessage(item.replyTo.id)}
                                            >
                                                <Text style={styles.quotedSender}>
                                                    {item.replyTo.senderName || 'Message'}
                                                </Text>
                                                <Text numberOfLines={2} style={styles.quotedText}>
                                                    {messagePreview(item.replyTo)}
                                                </Text>
                                            </TouchableOpacity>
                                        )}
                                        {image ? (
                                            <Image source={{ uri: image }} style={styles.image} />
                                        ) : (
                                            <Text style={styles.text}>{item.content}</Text>
                                        )}
                                        <View style={styles.messageMeta}>
                                            <Text style={styles.timestamp}>{timestamp}</Text>
                                            {mine && (
                                                <Text style={[
                                                    styles.statusTicks,
                                                    read && styles.readTicks
                                                ]}>
                                                    {delivered ? '✓✓' : '✓'}
                                                </Text>
                                            )}
                                        </View>
                                    </TouchableOpacity>
                                    {reactionGroups.length > 0 && (
                                        <View style={styles.reactions}>
                                            {reactionGroups.map(reaction => (
                                                <TouchableOpacity
                                                    key={reaction.emoji}
                                                    style={[
                                                        styles.reactionChip,
                                                        reaction.selected && styles.reactionChipSelected
                                                    ]}
                                                    onPress={() => toggleReaction(item, reaction.emoji)}
                                                >
                                                    <Text style={styles.reactionText}>
                                                        {reaction.emoji} {reaction.count}
                                                    </Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            </View>
                        );
                    })}
                </ScrollView>

                <View style={styles.composer}>
                    {replyTo && (
                        <View style={styles.replyPreview}>
                            <View style={styles.replyPreviewContent}>
                                <Text style={styles.quotedSender}>
                                    {replyTo.senderName || (replyTo.senderId === userId ? 'You' : 'Message')}
                                </Text>
                                <Text numberOfLines={1} style={styles.quotedText}>
                                    {messagePreview(replyTo)}
                                </Text>
                            </View>
                            <TouchableOpacity onPress={() => setReplyTo(null)} accessibilityLabel="Cancel reply">
                                <Text style={styles.cancelReply}>×</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    <View style={styles.inputRow}>
                        <TouchableOpacity onPress={pickImage}>
                            <Text style={styles.attach}>＋</Text>
                        </TouchableOpacity>

                        <TextInput
                            style={styles.input}
                            placeholder="Message..."
                            placeholderTextColor={colors.placeholder}
                            value={message}
                            onChangeText={setMessage}
                            multiline
                            scrollEnabled
                            onFocus={() => scrollRef.current?.scrollToEnd({ animated: true })}
                        />

                        <TouchableOpacity onPress={sendMessage} disabled={sending} accessibilityRole="button" accessibilityLabel="Send message">
                            <Text style={styles.send}>➤</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </KeyboardAvoidingView>
            <Modal
                visible={!!actionTarget}
                transparent
                animationType="fade"
                onRequestClose={() => setActionTarget(null)}
            >
                <View style={styles.modalBackdrop}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setActionTarget(null)}
                    />
                    <View style={styles.messageActions}>
                        <Text style={styles.actionTitle}>Message</Text>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => {
                                setReplyTo(actionTarget);
                                setActionTarget(null);
                            }}
                        >
                            <Text style={styles.actionText}>Reply</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => {
                                setReactionTarget(actionTarget);
                                setActionTarget(null);
                            }}
                        >
                            <Text style={styles.actionText}>React</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => setActionTarget(null)}
                        >
                            <Text style={styles.cancelAction}>Cancel</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
            <Modal
                visible={!!reactionTarget}
                transparent
                animationType="fade"
                onRequestClose={() => setReactionTarget(null)}
            >
                <View style={styles.reactionBackdrop}>
                    <Pressable
                        style={StyleSheet.absoluteFill}
                        onPress={() => setReactionTarget(null)}
                    />
                    <View style={styles.reactionPicker}>
                        {REACTIONS.map(emoji => (
                            <TouchableOpacity
                                key={emoji}
                                onPress={() => toggleReaction(reactionTarget, emoji)}
                                accessibilityRole="button"
                                accessibilityLabel={`React ${emoji}`}
                            >
                                <Text style={styles.reactionOption}>{emoji}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </Modal>
        </>
    );
}

const createStyles = colors => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { padding: 16, backgroundColor: colors.surface },
    title: { fontSize: 18, fontWeight: 'bold', color: colors.text },
    subtitle: { color: colors.muted, marginTop: 4 },
    messageList: { flex: 1 },
    messages: { padding: 12 },
    row: { flexDirection: 'row', marginVertical: 5 },
    messageContent: { maxWidth: '80%' },
    messageContentMine: { alignItems: 'flex-end' },
    messageContentOther: { alignItems: 'flex-start' },
    bubble: { maxWidth: '100%', padding: 11, borderRadius: 15 },
    text: { fontSize: 15, color: colors.text },
    image: { width: 200, height: 180, borderRadius: 10 },
    messageMeta: {
        flexDirection: 'row', justifyContent: 'flex-end',
        alignItems: 'center', marginTop: 3
    },
    timestamp: { color: colors.muted, fontSize: 10 },
    statusTicks: {
        color: colors.statusSent, fontSize: 12, fontWeight: '700',
        marginLeft: 4, letterSpacing: -2
    },
    readTicks: { color: colors.statusRead },
    quotedMessage: {
        borderLeftWidth: 3, borderLeftColor: colors.quote,
        backgroundColor: colors.surfaceAlt, padding: 7,
        marginBottom: 7, borderRadius: 4
    },
    quotedSender: { color: colors.quote, fontSize: 12, fontWeight: '700' },
    quotedText: { color: colors.muted, fontSize: 12, marginTop: 2 },
    reactions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 3 },
    reactionChip: {
        backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border,
        borderRadius: 12, paddingHorizontal: 7, paddingVertical: 2, marginRight: 4, marginBottom: 3
    },
    reactionChipSelected: { backgroundColor: colors.avatar, borderColor: colors.primary },
    reactionText: { color: colors.text, fontSize: 13 },
    modalBackdrop: {
        flex: 1, backgroundColor: colors.overlay,
        justifyContent: 'center', alignItems: 'center'
    },
    messageActions: {
        width: '78%', backgroundColor: colors.surface,
        borderRadius: 14, padding: 12
    },
    actionTitle: {
        color: colors.muted, fontSize: 13, fontWeight: '600',
        paddingHorizontal: 10, paddingVertical: 8
    },
    actionButton: { paddingHorizontal: 10, paddingVertical: 12 },
    actionText: { color: colors.text, fontSize: 16 },
    cancelAction: { color: colors.primary, fontSize: 16, fontWeight: '600' },
    reactionBackdrop: {
        flex: 1, backgroundColor: colors.overlay,
        justifyContent: 'center', alignItems: 'center'
    },
    reactionPicker: {
        flexDirection: 'row', backgroundColor: colors.surface,
        borderRadius: 24, paddingHorizontal: 10, paddingVertical: 8
    },
    reactionOption: { fontSize: 28, paddingHorizontal: 5 },
    composer: { backgroundColor: colors.surface },
    replyPreview: {
        flexDirection: 'row', alignItems: 'center',
        borderLeftWidth: 3, borderLeftColor: colors.quote,
        backgroundColor: colors.surfaceAlt, marginHorizontal: 10,
        marginTop: 8, paddingHorizontal: 10, paddingVertical: 6,
        borderRadius: 5
    },
    replyPreviewContent: { flex: 1 },
    cancelReply: { color: colors.muted, fontSize: 24, paddingHorizontal: 6 },
    inputRow: {
        flexDirection: 'row', alignItems: 'flex-end',
        padding: 10, gap: 10
    },
    input: {
        flex: 1, minHeight: 42, maxHeight: 100,
        backgroundColor: colors.surfaceAlt, color: colors.text,
        borderRadius: 20, paddingHorizontal: 15, paddingVertical: 10
    },
    attach: { fontSize: 25, color: colors.primary },
    send: { fontSize: 23, color: colors.primary }
});
