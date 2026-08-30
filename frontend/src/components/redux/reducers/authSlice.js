import { createSlice } from '@reduxjs/toolkit';

const initialState = {
    isAuthenticated: false,
    isInitialized: false,
};

const authSlice = createSlice({
    name: 'auth',
    initialState,
    reducers: {
        loginSuccess: (state) => {
            state.isAuthenticated = true;
            state.isInitialized = true;
        },
        authCheckComplete: (state) => {
            state.isInitialized = true;
        },
        logout: (state) => {
            state.isAuthenticated = false;
            state.isInitialized = true;
        },
    },
});

export const { authCheckComplete, loginSuccess, logout } = authSlice.actions;
export default authSlice.reducer;
