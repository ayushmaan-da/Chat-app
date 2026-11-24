
import { useEffect, useState, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity,
    ScrollView, Image, Alert, StyleSheet,
    KeyboardAvoidingView, Platform
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

const API = 'http://10.7.30.107:3000';
const AUTH = 'Basic Ayushmaan:54321';

export default function ChatScreen({ route }) {
    const [messages, setMessages] = useState([]);
    const [message, setMessage] = useState('');
    const [userId, setUserId] = useState('');
    const [sending, setSending] = useState(false);
    const scrollRef = useRef(null);

    const { name, conversationId, participants } = route.params.data;

    const getMessages = async () => {
        const res = await fetch(
            `${API}/message?conversation_id=${conversationId}`,
            { headers: { Authorization: AUTH } }
        );
        if (!res.ok) throw new Error('Failed to load messages');

        const data = await res.json();
        setMessages(Array.isArray(data) ? data : data.data || []);
    };

    useEffect(() => {
        const loadChat = async () => {
            try {
                const [usersRes] = await Promise.all([
                    fetch(`${API}/user`, { headers: { Authorization: AUTH } }),
                    getMessages()
                ]);

                if (!usersRes.ok) throw new Error('Failed to load users');

                const users = await usersRes.json();
                setUserId(users.find(u => u.name === 'Ayushmaan')?.id || '');
            } catch (err) {
                Alert.alert('Error', err.message);
            }
        };

        loadChat();
    }, []);

    const sendMessage = async () => {
        if (!message.trim() || sending) return;

        try {
            setSending(true);
            const res = await fetch(`${API}/message`, {
                method: 'POST',
                headers: {
                    Authorization: AUTH,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    conversation_id: conversationId,
                    content: message.trim()
                })
            });

            if (!res.ok) throw new Error('Message sending failed');

            setMessage('');
            await getMessages();
        } catch (err) {
            Alert.alert('Error', err.message);
        } finally {
            setSending(false);
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

            if (!res.ok) throw new Error('Image sending failed');
            await getMessages();
        } catch (err) {
            Alert.alert('Error', err.message);
        }
    };

    return (
        <KeyboardAvoidingView
            style={styles.container}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
            <View style={styles.header}>
                <Text style={styles.title}>{name}</Text>
                <Text style={styles.subtitle}>
                    {participants.length} participants
                </Text>
            </View>

            <ScrollView
                ref={scrollRef}
                contentContainerStyle={styles.messages}
                onContentSizeChange={() =>
                    scrollRef.current?.scrollToEnd({ animated: true })
                }
            >
                {messages.map((item, index) => {
                    const mine = item.senderId === userId;
                    const image = item.imageInfo
                        ? item.imageInfo.startsWith('data:')
                            ? item.imageInfo
                            : `data:image/jpeg;base64,${item.imageInfo}`
                        : null;

                    return (
                        <View
                            key={item.id || index}
                            style={[
                                styles.row,
                                { justifyContent: mine ? 'flex-end' : 'flex-start' }
                            ]}
                        >
                            <View style={[
                                styles.bubble,
                                { backgroundColor: mine ? '#D9FDD3' : '#FFFFFF' }
                            ]}>
                                {image ? (
                                    <Image source={{ uri: image }} style={styles.image} />
                                ) : (
                                    <Text style={styles.text}>{item.content}</Text>
                                )}
                            </View>
                        </View>
                    );
                })}
            </ScrollView>

            <View style={styles.inputRow}>
                <TouchableOpacity onPress={pickImage}>
                    <Text style={styles.attach}>＋</Text>
                </TouchableOpacity>

                <TextInput
                    style={styles.input}
                    placeholder="Message..."
                    value={message}
                    onChangeText={setMessage}
                />

                <TouchableOpacity onPress={sendMessage} disabled={sending}>
                    <Text style={styles.send}>➤</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F5F5F5' },
    header: { padding: 16, backgroundColor: 'white' },
    title: { fontSize: 18, fontWeight: 'bold' },
    subtitle: { color: '#888', marginTop: 4 },
    messages: { padding: 12 },
    row: { flexDirection: 'row', marginVertical: 5 },
    bubble: { maxWidth: '80%', padding: 11, borderRadius: 15 },
    text: { fontSize: 15, color: '#222' },
    image: { width: 200, height: 180, borderRadius: 10 },
    inputRow: {
        flexDirection: 'row', alignItems: 'center',
        padding: 10, backgroundColor: 'white', gap: 10
    },
    input: {
        flex: 1, backgroundColor: '#F2F2F2',
        borderRadius: 20, paddingHorizontal: 15
    },
    attach: { fontSize: 25, color: '#168C4A' },
    send: { fontSize: 23, color: '#168C4A' }
});
