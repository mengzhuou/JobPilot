import { createStore, combineReducers } from 'redux';
import { composeWithDevTools } from '@redux-devtools/extension';
import reducers from "./reducers/index";
import classReducer from './reducers/classReducers';
import studentReducer from './reducers/studentReducer';
import reservationCartReducer from './reducers/reservationCartReducers';
import authReducer from './reducers/authSlice';

const combinedReducer = combineReducers({
    ...reducers,
    classData: classReducer,
    studentData: studentReducer,
    reservationCart: reservationCartReducer,
    auth: authReducer
});

// Clear account-specific state as well as authentication when leaving an account.
export const rootReducer=(state,action)=>combinedReducer(action.type==='auth/logout'?undefined:state,action);

const store = createStore(rootReducer, composeWithDevTools());

export default store;
