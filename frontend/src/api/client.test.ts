import {afterEach,describe,it,expect,vi} from 'vitest';
import {consumeSse,getHealth} from './client';

afterEach(()=>vi.unstubAllGlobals());

describe('API authentication',()=>{
  it('never sends the retired shared app token',async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({status:'ok',auth_configured:false,ai_configured:false,providers:[],default_provider:'none',model:'',meeting_storage:'ephemeral-memory'}),{status:200,headers:{'Content-Type':'application/json'}}));
    vi.stubGlobal('fetch',fetchMock);
    await getHealth();
    const headers=new Headers(fetchMock.mock.calls[0][1]?.headers);
    expect(headers.has('X-App-Token')).toBe(false);
  });
});

describe('SSE parser',()=>{
  it('reassembles event frames split across arbitrary chunks',async()=>{
    const chunks=['event: sta','tus\ndata: {"state":"extracting"}\n\neve','nt: token\ndata: {"text":"hi"}\n\n'];
    const stream=new ReadableStream<Uint8Array>({start(controller){for(const x of chunks)controller.enqueue(new TextEncoder().encode(x));controller.close()}});
    const events:{event:string;data:Record<string,unknown>}[]=[];
    await consumeSse(new Response(stream),e=>events.push(e));
    expect(events).toEqual([{event:'status',data:{state:'extracting'}},{event:'token',data:{text:'hi'}}]);
  });
});
