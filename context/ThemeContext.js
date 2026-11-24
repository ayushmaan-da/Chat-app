import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'chat_app_theme_mode';
const ThemeContext = createContext(null);

const palettes = {
    light: {
        background: '#F5F5F5',
        surface: '#FFFFFF',
        surfaceAlt: '#F2F2F2',
        text: '#222222',
        muted: '#667781',
        border: '#E5E5E5',
        primary: '#168C4A',
        onPrimary: '#FFFFFF',
        avatar: '#D9FDD3',
        sentBubble: '#D9FDD3',
        receivedBubble: '#FFFFFF',
        quote: '#168C4A',
        placeholder: '#777777',
        statusSent: '#8696A0',
        statusRead: '#168FD1',
        overlay: 'rgba(0,0,0,0.35)'
    },
    dark: {
        background: '#0B141A',
        surface: '#172126',
        surfaceAlt: '#263238',
        text: '#E9EDEF',
        muted: '#AAB4BA',
        border: '#35434A',
        primary: '#00A884',
        onPrimary: '#06241F',
        avatar: '#174B3E',
        sentBubble: '#005C4B',
        receivedBubble: '#202C33',
        quote: '#57D9B3',
        placeholder: '#AAB4BA',
        statusSent: '#AAB4BA',
        statusRead: '#53BDEB',
        overlay: 'rgba(0,0,0,0.65)'
    }
};

export function ThemeProvider({ children }) {
    const [mode, setModeState] = useState('light');
    const [ready, setReady] = useState(false);
    const writes = useRef(Promise.resolve());

    useEffect(() => {
        let mounted = true;
        AsyncStorage.getItem(STORAGE_KEY)
            .then(savedMode => {
                if (mounted && (savedMode === 'light' || savedMode === 'dark')) {
                    setModeState(savedMode);
                }
            })
            .catch(error => {
                if (mounted) Alert.alert('Theme preference unavailable', error.message);
            })
            .finally(() => {
                if (mounted) setReady(true);
            });

        return () => {
            mounted = false;
        };
    }, []);

    const setMode = useCallback(nextMode => {
        if (nextMode !== 'light' && nextMode !== 'dark') return;
        setModeState(nextMode);
        writes.current = writes.current
            .then(() => AsyncStorage.setItem(STORAGE_KEY, nextMode))
            .catch(error => {
                Alert.alert('Could not save theme preference', error.message);
            });
    }, []);

    const value = useMemo(() => ({
        mode,
        colors: palettes[mode],
        ready,
        setMode
    }), [mode, ready, setMode]);

    return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within ThemeProvider');
    return context;
}
