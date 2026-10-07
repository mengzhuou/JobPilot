import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    isAuthenticated: false,
    isInitialized: false,
    sessionError: '',
    checkAttempt: 0,
};

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        loginSuccess: (state) => {
            state.isAuthenticated = true;
            state.isInitialized = true;
            state.sessionError = '';
        },
        authCheckComplete: (state) => {
            state.isInitialized = true;
            state.sessionError = '';
        },
        sessionCheckFailed: (state, action) => { state.sessionError = action.payload; },
        retrySessionCheck: (state) => { state.sessionError = ''; state.checkAttempt += 1; },
        logout: (state) => {
            state.isAuthenticated = false;
            state.isInitialized = true;
            state.sessionError = '';
        },
    },
});

export const { authCheckComplete, loginSuccess, logout, sessionCheckFailed, retrySessionCheck } = authSlice.actions;
export default authSlice.reducer;
