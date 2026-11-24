
import { useState, useEffect, useMemo } from 'react';
import {
    View, Text, TextInput, ScrollView,
    TouchableOpacity, StyleSheet, Alert
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

const API = 'http://10.7.30.107:3000';
const AUTH = 'Basic Ayushmaan:54321';

export default function AllUsers({ navigation }) {
    const { colors } = useTheme();
    const styles = useMemo(() => createStyles(colors), [colors]);
    const [users, setUsers] = useState([]);
    const [currentUserId, setCurrentUserId] = useState('');
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState([]);
    const [type, setType] = useState('DM');
    const [groupName, setGroupName] = useState('');

    useEffect(() => {
        const loadUsers = async () => {
            try {
                const [usersRes, profileRes] = await Promise.all([
                    fetch(`${API}/user`, { headers: { Authorization: AUTH } }),
                    fetch(`${API}/user/profile`, { headers: { Authorization: AUTH } })
                ]);
                if (!usersRes.ok || !profileRes.ok) {
                    throw new Error('Failed to load users or current profile');
                }

                const [allUsers, profile] = await Promise.all([
                    usersRes.json(),
                    profileRes.json()
                ]);
                setUsers(allUsers);
                setCurrentUserId(profile.id);
            } catch (err) {
                Alert.alert('Error', err.message);
            }
        };

        loadUsers();
    }, []);

    const toggleUser = id => {
    if (type === 'DM') {
        setSelected(old => old.includes(id) ? [] : [id]);
    } else {
        setSelected(old =>
            old.includes(id) ? old.filter(x => x !== id) : [...old, id]
        );
    }
    };

    const createConversation = async () => {
        if (!selected.length) {
            return Alert.alert('Select a contact first');
        }

        if (type === 'GROUP' && !groupName.trim()) {
            return Alert.alert('Enter a group name');
        }

        try {
            const res = await fetch(`${API}/conversation`, {
                method: 'POST',
                headers: {
                    Authorization: AUTH,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    type,
                    name: type === 'DM' ? '' : groupName.trim(),
                    participants_ids: selected
                })
            });

            if (!res.ok) throw new Error('Conversation creation failed');

            const data = await res.json();
            setSelected([]);
            setGroupName('');

            navigation.navigate('Conversations', {
                refresh: Date.now(),
                conversationId: data.id
            });
        } catch (err) {
            Alert.alert('Error', err.message);
        }
    };

    const filteredUsers = users.filter(user =>
        user.id !== currentUserId &&
        user.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <View style={styles.container}>
            <Text style={styles.title}>New chat</Text>

            <TextInput
                style={styles.search}
                placeholder="Search contacts..."
                placeholderTextColor={colors.muted}
                value={search}
                onChangeText={setSearch}
            />

            <View style={styles.tabs}>
                {['DM', 'GROUP'].map(value => (
                    <TouchableOpacity
                        key={value}
                        style={[styles.tab, type === value && styles.active]}
                        onPress={() => {
                        setType(value);
                        setSelected([]);
                    }}
                    >
                        <Text style={type === value ? styles.activeTabText : styles.tabText}>
                            {value === 'DM' ? 'Personal chat' : 'Group chat'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {type === 'GROUP' && (
                <TextInput
                    style={styles.search}
                    placeholder="Group name"
                    placeholderTextColor={colors.muted}
                    value={groupName}
                    onChangeText={setGroupName}
                />
            )}

            <Text style={styles.section}>CONTACTS</Text>

            <ScrollView style={{ flex: 1 }}>
                {filteredUsers.map(user => {
                    const checked = selected.includes(user.id);

                    return (
                        <TouchableOpacity
                            key={user.id}
                            style={styles.row}
                            onPress={() => toggleUser(user.id)}
                        >
                            <View style={styles.avatar}>
                                <Text style={styles.initial}>
                                    {user.name.charAt(0).toUpperCase()}
                                </Text>
                            </View>

                            <View style={{ flex: 1 }}>
                                <Text style={styles.name}>{user.name}</Text>
                                <Text style={styles.bio}>
                                    {user.bio || 'Available to chat'}
                                </Text>
                            </View>

                            <Text style={styles.check}>
                                {checked ? '✓' : '○'}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            <View style={styles.bottom}>
                <Text style={styles.count}>
                    {selected.length} selected
                </Text>
                <TouchableOpacity
                    style={styles.create}
                    onPress={createConversation}
                >
                    <Text style={styles.createText}>Start conversation</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

const createStyles = colors => StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    title: { fontSize: 26, fontWeight: 'bold', margin: 18, color: colors.text },
    search: {
        backgroundColor: colors.surfaceAlt, color: colors.text, marginHorizontal: 16,
        marginBottom: 12, padding: 12, borderRadius: 10
    },
    tabs: {
        flexDirection: 'row', marginHorizontal: 16,
        backgroundColor: colors.surfaceAlt, borderRadius: 10, padding: 4
    },
    tab: { flex: 1, alignItems: 'center', padding: 11, borderRadius: 8 },
    active: { backgroundColor: colors.primary },
    activeTabText: { color: colors.onPrimary },
    tabText: { color: colors.text },
    section: {
        color: colors.primary, fontWeight: 'bold',
        margin: 18, marginBottom: 5
    },
    row: {
        flexDirection: 'row', alignItems: 'center',
        padding: 14, borderBottomWidth: 1, borderColor: colors.border
    },
    avatar: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: colors.avatar, justifyContent: 'center',
        alignItems: 'center', marginRight: 12
    },
    initial: { color: colors.primary, fontSize: 19, fontWeight: 'bold' },
    name: { fontSize: 15, fontWeight: '600', color: colors.text },
    bio: { color: colors.muted, marginTop: 4, fontSize: 12 },
    check: { color: colors.primary, fontSize: 22 },
    bottom: { padding: 15, borderTopWidth: 1, borderColor: colors.border },
    count: { color: colors.muted, marginBottom: 10 },
    create: {
        backgroundColor: colors.primary,
        padding: 14, borderRadius: 10, alignItems: 'center'
    },
    createText: { color: colors.onPrimary, fontWeight: 'bold' },
    info: { textAlign: 'center', marginTop: 30, color: colors.muted }
});
