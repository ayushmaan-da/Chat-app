
import { useState, useEffect } from 'react';
import {
    View, Text, TextInput, ScrollView,
    TouchableOpacity, StyleSheet, Alert
} from 'react-native';

const API = 'http://10.7.30.107:3000';
const AUTH = 'Basic Ayushmaan:54321';

export default function AllUsers() {
    const [users, setUsers] = useState([]);
    const [search, setSearch] = useState('');
    const [selected, setSelected] = useState([]);
    const [type, setType] = useState('DM');
    const [groupName, setGroupName] = useState('');

    useEffect(() => {
        fetch(`${API}/user`, { headers: { Authorization: AUTH } })
            .then(res => {
                if (!res.ok) throw new Error('Failed to load users');
                return res.json();
            })
            .then(setUsers)
            .catch(err => Alert.alert('Error', err.message));
    }, []);

    const toggleUser = id => {
        setSelected(old =>
            old.includes(id) ? old.filter(x => x !== id) : [...old, id]
        );
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
            Alert.alert('Success', `${data.name} created successfully`);
        } catch (err) {
            Alert.alert('Error', err.message);
        }
    };

    const filteredUsers = users.filter(user =>
        user.name !== 'Ayushmaan' &&
        user.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <View style={styles.container}>
            <Text style={styles.title}>New chat</Text>

            <TextInput
                style={styles.search}
                placeholder="Search contacts..."
                value={search}
                onChangeText={setSearch}
            />

            <View style={styles.tabs}>
                {['DM', 'GROUP'].map(value => (
                    <TouchableOpacity
                        key={value}
                        style={[styles.tab, type === value && styles.active]}
                        onPress={() => setType(value)}
                    >
                        <Text style={{ color: type === value ? 'white' : '#555' }}>
                            {value === 'DM' ? 'Personal chat' : 'Group chat'}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {type === 'GROUP' && (
                <TextInput
                    style={styles.search}
                    placeholder="Group name"
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

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: 'white' },
    title: { fontSize: 26, fontWeight: 'bold', margin: 18 },
    search: {
        backgroundColor: '#F2F2F2', marginHorizontal: 16,
        marginBottom: 12, padding: 12, borderRadius: 10
    },
    tabs: {
        flexDirection: 'row', marginHorizontal: 16,
        backgroundColor: '#F2F2F2', borderRadius: 10, padding: 4
    },
    tab: { flex: 1, alignItems: 'center', padding: 11, borderRadius: 8 },
    active: { backgroundColor: '#168C4A' },
    section: {
        color: '#168C4A', fontWeight: 'bold',
        margin: 18, marginBottom: 5
    },
    row: {
        flexDirection: 'row', alignItems: 'center',
        padding: 14, borderBottomWidth: 1, borderColor: '#eee'
    },
    avatar: {
        width: 48, height: 48, borderRadius: 24,
        backgroundColor: '#D9FDD3', justifyContent: 'center',
        alignItems: 'center', marginRight: 12
    },
    initial: { color: '#168C4A', fontSize: 19, fontWeight: 'bold' },
    name: { fontSize: 15, fontWeight: '600' },
    bio: { color: '#888', marginTop: 4, fontSize: 12 },
    check: { color: '#168C4A', fontSize: 22 },
    bottom: { padding: 15, borderTopWidth: 1, borderColor: '#eee' },
    count: { color: '#888', marginBottom: 10 },
    create: {
        backgroundColor: '#168C4A',
        padding: 14, borderRadius: 10, alignItems: 'center'
    },
    createText: { color: 'white', fontWeight: 'bold' }
});
