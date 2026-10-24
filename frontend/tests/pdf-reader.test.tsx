import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {PdfReader} from '../src/components/pdf-reader';
const mock=vi.hoisted(()=>({load:vi.fn(),destroy:vi.fn().mockResolvedValue(undefined)}));
vi.mock('pdfjs-dist',()=>({GlobalWorkerOptions:{workerSrc:''},getDocument:(...args:unknown[])=>mock.load(...args)}));
beforeEach(()=>{
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({} as CanvasRenderingContext2D);
  mock.load.mockReturnValue({destroy:mock.destroy,promise:Promise.resolve({
    numPages:2,
    getPage:async(number:number)=>({
      getViewport:({scale}:{scale:number})=>({width:600*scale,height:800*scale}),
      render:()=>({promise:Promise.resolve(),cancel:vi.fn()}),
      getTextContent:async()=>({items:[{str:'Original learning material on page '+number}]}),
    }),
  })});
});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.clearAllMocks();});
it('renders pages, provides navigation and an accessible text view',async()=>{
  render(<PdfReader src="http://test/lesson.pdf" name="Lesson.pdf"/>);
  await waitFor(()=>expect(screen.getByRole('button',{name:'Next PDF page'})).toBeEnabled());
  expect(screen.getByRole('img',{name:'Lesson.pdf, page 1'})).toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Previous PDF page'})).toBeDisabled();
  fireEvent.click(screen.getByRole('button',{name:'Next PDF page'}));
  await waitFor(()=>expect(screen.getByRole('status')).toHaveTextContent('Page 2 of 2'));
  await waitFor(()=>expect(screen.getByRole('button',{name:'Text view'})).toBeEnabled());
  fireEvent.click(screen.getByRole('button',{name:'Text view'}));
  expect(screen.getByRole('button',{name:'Text view'})).toHaveAttribute('aria-pressed','true');
  expect(screen.getByText('Original learning material on page 2')).toBeInTheDocument();
  expect(mock.load).toHaveBeenCalledWith(expect.objectContaining({url:'http://test/lesson.pdf',enableXfa:false}));
});
it('shows a recoverable error when a PDF cannot be opened',async()=>{
  mock.load.mockImplementation(()=>({destroy:mock.destroy,promise:Promise.reject(new Error('Bad PDF'))}));
  render(<PdfReader src="http://test/bad.pdf" name="Bad.pdf"/>);
  expect(await screen.findByRole('alert')).toHaveTextContent('The PDF could not be opened');
});

