import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { FileText } from 'lucide-react';
import { ScoreRing, MetricCard } from '../src/components/product-cards';
import { ProductPreview } from '../src/components/product-preview';
import { demoPreview } from '../src/lib/demo-preview';

afterEach(cleanup);
describe('shared product presentation',()=>{
  it('describes score values accessibly and keeps them within the scale',()=>{render(<ScoreRing value={120}/>);expect(screen.getByRole('img',{name:'Score 100 out of 100'})).toBeInTheDocument()});
  it('keeps metrics meaningful without decorative icons',()=>{render(<MetricCard icon={FileText} label="CV quality" value="82" suffix="/ 100" note="Your personal improvement benchmark" color="violet"/>);expect(screen.getByText('CV quality')).toBeInTheDocument();expect(screen.getByText('Your personal improvement benchmark')).toBeInTheDocument()});
  it('renders the bundled fictional snapshot without interactive chrome',()=>{const {container}=render(<ProductPreview/>);expect(screen.getByText(demoPreview.label)).toBeInTheDocument();expect(screen.getByRole('img',{name:'Score 82 out of 100'})).toBeInTheDocument();expect(screen.getByRole('heading',{name:'Junior Data Analyst'})).toBeInTheDocument();expect(container.querySelectorAll('button,input,a')).toHaveLength(0)});
});
