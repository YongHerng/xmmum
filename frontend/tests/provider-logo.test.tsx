import {useState} from 'react';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MAX_LOGO_BYTES,PartnerLogoField,ProviderLogo,readLogoFile} from '../src/components/provider-logo';

afterEach(cleanup);
function Harness(){const [logo,setLogo]=useState('https://example.org/logo.png');return <><PartnerLogoField value={logo} onChange={setLogo} onBusyChange={()=>{}}/><output data-testid="saved-logo">{logo}</output></>;}
describe('partner logo authoring',()=>{
  it('previews an HTTPS logo, allows replacement and removes it',()=>{
    render(<Harness/>);expect(screen.getByRole('img',{name:'Partner logo'})).toHaveAttribute('src','https://example.org/logo.png');
    fireEvent.change(screen.getByLabelText('Or use an HTTPS image URL'),{target:{value:'https://example.org/new-logo.png'}});
    expect(screen.getByRole('img',{name:'Partner logo'})).toHaveAttribute('src','https://example.org/new-logo.png');
    fireEvent.click(screen.getByRole('button',{name:'Remove partner logo'}));expect(screen.getByTestId('saved-logo')).toHaveTextContent('');expect(screen.queryByRole('img',{name:'Partner logo'})).not.toBeInTheDocument();
  });
  it('reads an uploaded PNG as a data URL and shows the preview',async()=>{
    render(<Harness/>);const image=new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0,0,0])],'logo.png',{type:'image/png'});
    fireEvent.change(screen.getByLabelText('Upload partner logo'),{target:{files:[image]}});
    await waitFor(()=>expect(screen.getByTestId('saved-logo').textContent).toMatch(/^data:image\/png;base64,/));
    expect(screen.getByRole('img',{name:'Partner logo'})).toHaveAttribute('src',screen.getByTestId('saved-logo').textContent);
  });
  it('rejects unsafe formats and oversized images, keeping the previous logo',async()=>{
    await expect(readLogoFile(new File(['<svg/>'],'logo.svg',{type:'image/svg+xml'}))).rejects.toThrow('SVG is not supported');
    await expect(readLogoFile(new File([new Uint8Array(MAX_LOGO_BYTES+1)],'large.png',{type:'image/png'}))).rejects.toThrow('256 KB');
    render(<Harness/>);fireEvent.change(screen.getByLabelText('Upload partner logo'),{target:{files:[new File(['<svg/>'],'logo.svg',{type:'image/svg+xml'})]}});
    expect(await screen.findByRole('alert')).toHaveTextContent('Your previous logo has been kept');expect(screen.getByTestId('saved-logo')).toHaveTextContent('https://example.org/logo.png');
  });
  it('falls back gracefully if a remote logo cannot load',()=>{
    render(<ProviderLogo name="Huawei" src="https://example.org/missing.png"/>);fireEvent.error(screen.getByRole('img',{name:'Huawei logo'}));
    expect(screen.queryByRole('img',{name:'Huawei logo'})).not.toBeInTheDocument();expect(screen.getByLabelText('Huawei logo placeholder')).toBeInTheDocument();
  });
});

