import type {NextConfig} from 'next';
const config:NextConfig={poweredByHeader:false,outputFileTracingIncludes:{'/api/flyer':['./assets/*.pdf']},async redirects(){return [{source:'/index.html',destination:'/',permanent:false}];}};
export default config;
