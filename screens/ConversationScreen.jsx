
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet, AppState, Alert
} from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';

const API = 'http://10.7.30.107:3000';
const AUTH = 'Basic Ayushmaan:54321';
const PINNED_CONVERSATIONS_KEY = 'chat_app_pinned_conversations';

export default function ConversationScreen({ navigation }) {
    const { mode, setMode, colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [conversations, setConversations] = useState([]);
    const [pinnedConversationIds, setPinnedConversationIds] = useState([]);
    const [loading, setLoading] = useState(true);
    const currentUserId = useRef('');
    const pinnedConversationIdsRef = useRef(new Set());
    const pinsLoadedForUser = useRef('');
    const pinWrites = useRef(Promise.resolve());
    const loadingRequest = useRef(false);
    const isFocused = useIsFocused();

    const loadConversations = useCallback(async (showLoading = false) => {
        if (loadingRequest.current) return;
        loadingRequest.current = true;
        try {
            if (!currentUserId.current) {
                const profileResponse = await fetch(`${API}/user/profile`, {
                    headers: { Authorization: AUTH }
                });
                if (!profileResponse.ok) {
                    throw new Error(`Failed to load current user (HTTP ${profileResponse.status})`);
                }
                const profile = await profileResponse.json();
                if (!profile.id) throw new Error('Current user response did not contain an ID');
                currentUserId.current = profile.id;
            }

            const userId = currentUserId.current;
            if (pinsLoadedForUser.current !== userId) {
                try {
                    const savedPins = await AsyncStorage.getItem(
                        `${PINNED_CONVERSATIONS_KEY}:${userId}`
                    );
                    const parsedPins = savedPins ? JSON.parse(savedPins) : [];
                    if (!Array.isArray(parsedPins)) {
                        throw new Error('Saved pinned conversations are invalid');
                    }
                    const validPins = [...new Set(parsedPins.filter(id => typeof id === 'string'))];
                    pinnedConversationIdsRef.current = new Set(validPins);
                    setPinnedConversationIds(validPins);
                } catch (error) {
                    pinnedConversationIdsRef.current = new Set();
                    setPinnedConversationIds([]);
                    Alert.alert('Pinned conversations unavailable', error.message);
                } finally {
                    pinsLoadedForUser.current = userId;
                }
            }

            const res = await fetch(`${API}/conversation`, {
                headers: { Authorization: AUTH }
            });

            if (!res.ok) throw new Error(`Failed to load conversations (HTTP ${res.status})`);

            const data = await res.json();

            const updated = await Promise.all(data.map(async item => {
                const response = await fetch(
                    `${API}/message?conversation_id=${item.id}`,
                    { headers: { Authorization: AUTH } }
                );

                if (!response.ok) {
                    throw new Error(`Failed to load messages (HTTP ${response.status})`);
                }
                const result = await response.json();
                const messages = Array.isArray(result) ? result : result.data || [];
                await Promise.all(messages
                    .filter(message =>
                        message.senderId !== currentUserId.current &&
                        !message.status?.[currentUserId.current]?.delivered
                    )
                    .map(message => fetch(`${API}/message/acknowledge`, {
                        method: 'POST',
                        headers: {
                            Authorization: AUTH,
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            conversation_id: item.id,
                            message_id: message.id,
                            status: 'delivered'
                        })
                    }).then(ackResponse => {
                        if (!ackResponse.ok) {
                            throw new Error(`Message delivery acknowledgement failed (HTTP ${ackResponse.status})`);
                        }
                    })));

                return { ...item, lastMessage: messages[messages.length - 1] };
            }));

            setConversations(updated);
        } catch (err) {
            console.warn('Conversation refresh failed:', err.message);
        } finally {
            loadingRequest.current = false;
            if (showLoading) setLoading(false);
        }
    }, []);

    const setConversationPinned = useCallback((conversationId, shouldPin) => {
        const nextPinnedIds = new Set(pinnedConversationIdsRef.current);
        if (shouldPin) nextPinnedIds.add(conversationId);
        else nextPinnedIds.delete(conversationId);

        pinnedConversationIdsRef.current = nextPinnedIds;
        const savedIds = [...nextPinnedIds];
        setPinnedConversationIds(savedIds);

        const userId = currentUserId.current;
        if (!userId) return;
        pinWrites.current = pinWrites.current
            .then(() => AsyncStorage.setItem(
                `${PINNED_CONVERSATIONS_KEY}:${userId}`,
                JSON.stringify(savedIds)
            ))
            .catch(error => {
                Alert.alert('Could not save pinned conversations', error.message);
            });
    }, []);

    const showConversationActions = item => {
        const isPinned = pinnedConversationIdsRef.current.has(item.id);
        Alert.alert(
            item.name?.replace(/^\[DM\]\s*/i, '') || 'Conversation',
            undefined,
            [
                {
                    text: isPinned ? 'Unpin' : 'Pin',
                    onPress: () => setConversationPinned(item.id, !isPinned)
                },
                { text: 'Cancel', style: 'cancel' }
            ]
        );
    };

    const sortedConversations = useMemo(() => {
        const activityTime = item => {
            const timestamp = item.lastMessage?.createdAt || item.createdAt;
            const value = timestamp ? new Date(timestamp).getTime() : 0;
            return Number.isFinite(value) ? value : 0;
        };

        return [...conversations].sort((a, b) => {
            const aPinned = pinnedConversationIds.includes(a.id);
            const bPinned = pinnedConversationIds.includes(b.id);
            if (aPinned !== bPinned) return aPinned ? -1 : 1;
            return activityTime(b) - activityTime(a);
        });
    }, [conversations, pinnedConversationIds]);

    useEffect(() => {
        if (!isFocused) return undefined;
        loadConversations(true);
        const interval = setInterval(() => {
            if (AppState.currentState === 'active') loadConversations();
        }, 5000);
        const subscription = AppState.addEventListener('change', state => {
            if (state === 'active') loadConversations();
        });
        return () => {
            clearInterval(interval);
            subscription.remove();
        };
    }, [isFocused, loadConversations]);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Messages</Text>
            <Text style={styles.subtitle}>Your conversations</Text>

            <View style={styles.appearance}>
                <Text style={styles.appearanceLabel}>Appearance</Text>
                <View style={styles.appearanceOptions}>
                    {['light', 'dark'].map(value => (
                        <TouchableOpacity
                            key={value}
                            accessibilityRole="button"
                            accessibilityState={{ selected: mode === value }}
                            onPress={() => setMode(value)}
                            style={[
                                styles.appearanceOption,
                                mode === value && styles.appearanceOptionSelected
                            ]}
                        >
                            <Text style={[
                                styles.appearanceOptionText,
                                mode === value && styles.appearanceOptionTextSelected
                            ]}>
                                {value === 'light' ? 'Light' : 'Dark'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            {loading ? (
                <Text style={styles.info}>Loading...</Text>
            ) : conversations.length === 0 ? (
                <Text style={styles.info}>No conversations yet</Text>
            ) : (
                <ScrollView>
                    {sortedConversations.map(item => {
                        const isPinned = pinnedConversationIds.includes(item.id);
                        const displayName = item.name?.replace(/^\[DM\]\s*/i, '');
                        return (
                        <TouchableOpacity
                            key={item.id}
                            style={styles.row}
                            delayLongPress={450}
                            onLongPress={() => showConversationActions(item)}
                            accessibilityRole="button"
                            accessibilityLabel={`${displayName || 'Conversation'}${isPinned ? ', pinned' : ''}`}
                            accessibilityHint={`Long press to ${isPinned ? 'unpin' : 'pin'} this conversation`}
                            onPress={() => navigation.navigate('Chat', {
                                data: {
                                    name: item.name,
                                    conversationId: item.id,
                                    participants: item.participants_ids
                                }
                            })}
                        >
                            <View style={styles.avatar}>
                                <Text style={styles.initial}>
                                    {(item.name || '?').replace(/^\[DM\]\s*/i, '').charAt(0).toUpperCase()}
                                </Text>
                            </View>

                            <View style={styles.details}>
                                <View style={styles.nameRow}>
                                    <Text style={styles.name}>{displayName}</Text>
                                    {isPinned && <Text style={styles.pinIcon}>📌</Text>}
                                </View>
                                <Text numberOfLines={1} style={styles.preview}>
                                    {item.lastMessage?.imageInfo
                                        ? '📷 Photo'
                                        : item.lastMessage?.content || 'No messages yet'}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    );
                    })}
                </ScrollView>
            )}
        </View>
    );
}

const createStyles = colors => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    title: { fontSize: 26, fontWeight: 'bold', margin: 18, marginBottom: 3, color: colors.text },
    subtitle: { color: colors.muted, marginHorizontal: 18, marginBottom: 15 },
    appearance: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        marginHorizontal: 18, marginBottom: 12
    },
    appearanceLabel: { color: colors.text, fontSize: 14, fontWeight: '600' },
    appearanceOptions: {
        flexDirection: 'row', backgroundColor: colors.surfaceAlt,
        borderRadius: 9, padding: 3
    },
    appearanceOption: { paddingHorizontal: 13, paddingVertical: 7, borderRadius: 7 },
    appearanceOptionSelected: { backgroundColor: colors.primary },
    appearanceOptionText: { color: colors.text, fontSize: 13, fontWeight: '600' },
    appearanceOptionTextSelected: { color: colors.onPrimary },
    row: {
        flexDirection: 'row', alignItems: 'center',
        padding: 14, borderBottomWidth: 1, borderColor: colors.border
    },
    avatar: {
        width: 50, height: 50, borderRadius: 25,
        backgroundColor: colors.avatar,
        justifyContent: 'center', alignItems: 'center', marginRight: 12
    },
    initial: { color: colors.primary, fontSize: 19, fontWeight: 'bold' },
    details: { flex: 1 },
    nameRow: { flexDirection: 'row', alignItems: 'center' },
    name: { fontSize: 16, fontWeight: '600', color: colors.text },
    pinIcon: { fontSize: 13, marginLeft: 7 },
    preview: { color: colors.muted, marginTop: 5 },
    info: { textAlign: 'center', marginTop: 30, color: colors.muted }
});
