
import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, TouchableOpacity, StyleSheet
} from 'react-native';

const API = 'http://10.7.30.107:3000';
const AUTH = 'Basic Ayushmaan:54321';

export default function ConversationScreen({ navigation }) {
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);

    const loadConversations = useCallback(async () => {
        try {
            setLoading(true);

            const res = await fetch(`${API}/conversation`, {
                headers: { Authorization: AUTH }
            });

            if (!res.ok) throw new Error('Failed to load conversations');

            const data = await res.json();

            const updated = await Promise.all(data.map(async item => {
                const response = await fetch(
                    `${API}/message?conversation_id=${item.id}`,
                    { headers: { Authorization: AUTH } }
                );

                const result = response.ok ? await response.json() : [];
                const messages = Array.isArray(result) ? result : result.data || [];

                return { ...item, lastMessage: messages[messages.length - 1] };
            }));

            setConversations(updated);
        } catch (err) {
            console.log(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const unsubscribe = navigation.addListener('focus', loadConversations);
        return unsubscribe;
    }, [navigation, loadConversations]);

    return (
        <View style={styles.container}>
            <Text style={styles.title}>Messages</Text>
            <Text style={styles.subtitle}>Your conversations</Text>

            {loading ? (
                <Text style={styles.info}>Loading...</Text>
            ) : conversations.length === 0 ? (
                <Text style={styles.info}>No conversations yet</Text>
            ) : (
                <ScrollView>
                    {conversations.map(item => (
                        <TouchableOpacity
                            key={item.id}
                            style={styles.row}
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
                                <Text style={styles.name}>
                                    {item.name?.replace(/^\[DM\]\s*/i, '')}
                                </Text>
                                <Text numberOfLines={1} style={styles.preview}>
                                    {item.lastMessage?.imageInfo
                                        ? '📷 Photo'
                                        : item.lastMessage?.content || 'No messages yet'}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white' },
    title: { fontSize: 26, fontWeight: 'bold', margin: 18, marginBottom: 3 },
    subtitle: { color: '#888', marginHorizontal: 18, marginBottom: 15 },
    row: {
        flexDirection: 'row', alignItems: 'center',
        padding: 14, borderBottomWidth: 1, borderColor: '#eee'
    },
    avatar: {
        width: 50, height: 50, borderRadius: 25,
        backgroundColor: '#D9FDD3',
        justifyContent: 'center', alignItems: 'center', marginRight: 12
    },
    initial: { color: '#168C4A', fontSize: 19, fontWeight: 'bold' },
    details: { flex: 1 },
    name: { fontSize: 16, fontWeight: '600', color: '#222' },
    preview: { color: '#888', marginTop: 5 },
    info: { textAlign: 'center', marginTop: 30, color: '#888' }
});
