import {describe,it,expect,vi,afterEach} from 'vitest';
import {render,screen,fireEvent,cleanup} from '@testing-library/react';
import {QuestionInput} from '../src/components/learning-pathway';
import {AuthorQuestion} from '../src/components/learning-studio';
import {answered,emptyQuestion,type Question} from '../src/lib/learning';

afterEach(cleanup);
const common={id:'q1',prompt:'Choose the correct response.',options:['Alpha','Beta','Gamma','Delta']};
describe('native learning question controls',()=>{
  it('renders all four creator types and changes the selected type',()=>{
    const update=vi.fn();render(<AuthorQuestion draft={emptyQuestion()} index={0} update={update}/>);
    expect(screen.getByRole('option',{name:'Single Answer'})).toBeInTheDocument();
    expect(screen.getByRole('option',{name:'Multiple Answer'})).toBeInTheDocument();
    expect(screen.getByRole('option',{name:'Fill in the Blank'})).toBeInTheDocument();
    expect(screen.getByRole('option',{name:'Mix Match'})).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Question type'),{target:{value:'matching'}});
    expect(update).toHaveBeenCalledWith(expect.objectContaining({question_type:'matching'}));
  });
  it('uses checkboxes for multiple answers, not a single-choice group',()=>{
    const update=vi.fn();render(<QuestionInput question={{...common,question_type:'multiple'} as Question} number={1} value={[0]} onChange={update}/>);
    expect(screen.getAllByRole('checkbox')).toHaveLength(4);
    fireEvent.click(screen.getByRole('checkbox',{name:'C Gamma'}));
    expect(update).toHaveBeenCalledWith([0,2]);
  });
  it('tracks typed fill answers and requires every distinct matching selection',()=>{
    const update=vi.fn();const fill={...common,question_type:'fill',options:[]} as Question;
    render(<QuestionInput question={fill} number={1} value="" onChange={update}/>);
    fireEvent.change(screen.getByLabelText('Your answer'),{target:{value:'IP'}});
    expect(update).toHaveBeenCalledWith('IP');expect(answered(fill,'  ')).toBe(false);expect(answered(fill,'IP')).toBe(true);
    const matching={id:'m',prompt:'Match the pairs.',question_type:'matching',options:{left:['Router','Switch'],right:['Networks','LAN']}} as Question;
    expect(answered(matching,{'0':'0'})).toBe(false);expect(answered(matching,{'0':'0','1':'0'})).toBe(false);expect(answered(matching,{'0':'0','1':'1'})).toBe(true);
  });
});

