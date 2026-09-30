import {connectExtension} from './connectExtension';
import {createExtensionPairingCode} from '../../../connector';
jest.mock('../../../connector',()=>({createExtensionPairingCode:jest.fn()}));
beforeEach(()=>{jest.clearAllMocks();Object.defineProperty(window,'crypto',{configurable:true,value:{randomUUID:()=> 'test-request'}});delete document.documentElement.dataset.jobpilotLogin;});
afterEach(()=>jest.useRealTimers());
test('missing extension fails before generating a code',async()=>{
    await expect(connectExtension()).rejects.toThrow(/Load or update/);
    expect(createExtensionPairingCode).not.toHaveBeenCalled();
});
test('signed-in pairing waits for matching extension acknowledgement',async()=>{
    document.documentElement.dataset.jobpilotLogin='ready';
    createExtensionPairingCode.mockResolvedValue({code:'ABCD-EFGH'});
    const operation=connectExtension();
    window.dispatchEvent(new MessageEvent('message',{source:window,origin:location.origin,data:{source:'jobpilot-extension',type:'connect-result',requestId:'wrong',connected:true}}));
    await Promise.resolve();
    window.dispatchEvent(new MessageEvent('message',{source:window,origin:location.origin,data:{source:'jobpilot-extension',type:'connect-result',requestId:'test-request',connected:true}}));
    await expect(operation).resolves.toBeUndefined();
});
test('unresponsive extensions time out instead of showing connected',async()=>{
    jest.useFakeTimers();document.documentElement.dataset.jobpilotLogin='ready';
    createExtensionPairingCode.mockResolvedValue({code:'ABCD-EFGH'});
    const operation=connectExtension();const result=expect(operation).rejects.toThrow(/did not respond/);
    jest.advanceTimersByTime(30000);await result;
});
