export type SocialNode = Readonly<{
  key: string;
  tag: string;
  props: Readonly<Record<string, string>>;
  text: string;
  children: readonly SocialNode[];
}>;
export const SOCIAL_ICONS: Readonly<Record<string, readonly SocialNode[]>> = {
  facebook: [
    {
      key: 'facebook-0',
      tag: 'circle',
      props: {
        cx: '12',
        cy: '12',
        r: '11',
        fill: '#1877F2',
      },
      text: '',
      children: [],
    },
    {
      key: 'facebook-1',
      tag: 'path',
      props: {
        d: 'M13.4 21v-7.3h2.5l.4-3h-2.9V8.8c0-.9.3-1.5 1.5-1.5h1.6V4.6A18 18 0 0 0 14.2 4C11.6 4 10 5.6 10 8.4v2.3H7.6v3H10V21Z',
        fill: 'white',
      },
      text: '',
      children: [],
    },
  ],
  instagram: [
    {
      key: 'instagram-0',
      tag: 'defs',
      props: {},
      text: '',
      children: [
        {
          key: 'instagram-0-0',
          tag: 'linearGradient',
          props: {
            id: 'igGrad',
            x1: '.1',
            x2: '.9',
            y1: '.95',
            y2: '.1',
          },
          text: '',
          children: [
            {
              key: 'instagram-0-0-0',
              tag: 'stop',
              props: {
                stopColor: '#FEDA77',
              },
              text: '',
              children: [],
            },
            {
              key: 'instagram-0-0-1',
              tag: 'stop',
              props: {
                offset: '.34',
                stopColor: '#F58529',
              },
              text: '',
              children: [],
            },
            {
              key: 'instagram-0-0-2',
              tag: 'stop',
              props: {
                offset: '.6',
                stopColor: '#DD2A7B',
              },
              text: '',
              children: [],
            },
            {
              key: 'instagram-0-0-3',
              tag: 'stop',
              props: {
                offset: '1',
                stopColor: '#8134AF',
              },
              text: '',
              children: [],
            },
          ],
        },
      ],
    },
    {
      key: 'instagram-1',
      tag: 'rect',
      props: {
        x: '2',
        y: '2',
        width: '20',
        height: '20',
        rx: '6',
        fill: 'url(#igGrad)',
      },
      text: '',
      children: [],
    },
    {
      key: 'instagram-2',
      tag: 'rect',
      props: {
        x: '6',
        y: '6',
        width: '12',
        height: '12',
        rx: '4',
        stroke: '#fff',
        strokeWidth: '1.9',
        fill: 'none',
      },
      text: '',
      children: [],
    },
    {
      key: 'instagram-3',
      tag: 'circle',
      props: {
        cx: '12',
        cy: '12',
        r: '3',
        stroke: 'white',
        strokeWidth: '1.9',
        fill: 'none',
      },
      text: '',
      children: [],
    },
    {
      key: 'instagram-4',
      tag: 'circle',
      props: {
        cx: '17.7',
        cy: '6.5',
        r: '1.15',
        fill: 'white',
      },
      text: '',
      children: [],
    },
  ],
  youtube: [
    {
      key: 'youtube-0',
      tag: 'rect',
      props: {
        x: '1',
        y: '4',
        width: '22',
        height: '16',
        rx: '5',
        fill: '#FF0033',
      },
      text: '',
      children: [],
    },
    {
      key: 'youtube-1',
      tag: 'path',
      props: {
        d: 'm10 8 7 4-7 4V8Z',
        fill: 'white',
      },
      text: '',
      children: [],
    },
  ],
  tiktok: [
    {
      key: 'tiktok-0',
      tag: 'path',
      props: {
        d: 'M15 3c.4 2.6 2.2 4.2 5 4.5v4.1c-2.2 0-4-.8-5-1.7v6.1c0 4-2.8 6.5-6.5 6.5C5 22.5 3 19.8 3 16.8c0-3.9 3.2-6.6 7.1-6.3v4c-1.8-.2-3 1-3 2.3 0 1.3.9 2.2 2 2.2 1.3 0 2.1-.9 2.1-2.4V3H15Z',
        fill: '#111827',
      },
      text: '',
      children: [],
    },
    {
      key: 'tiktok-1',
      tag: 'path',
      props: {
        d: 'M15 3c.3 2 1.4 3.3 3.1 3.9',
        fill: 'none',
        stroke: '#25F4EE',
        strokeWidth: '1.5',
      },
      text: '',
      children: [],
    },
    {
      key: 'tiktok-2',
      tag: 'path',
      props: {
        d: 'M11.2 13c-2.6-.5-5.5 1.3-5.5 4.1',
        fill: 'none',
        stroke: '#FE2C55',
        strokeWidth: '1.3',
      },
      text: '',
      children: [],
    },
  ],
  telegram: [
    {
      key: 'telegram-0',
      tag: 'circle',
      props: {
        cx: '12',
        cy: '12',
        r: '11',
        fill: '#229ED9',
      },
      text: '',
      children: [],
    },
    {
      key: 'telegram-1',
      tag: 'path',
      props: {
        d: 'm5.5 11.5 12-5c.7-.2 1.3.2 1 .9l-2.1 10.5c-.1.5-.6.7-1 .4l-3.6-2.7-2.1 2.1-.2-3.5 6-5.6-7.2 5.3-2.7-1c-.5-.2-.5-.8-.1-1.4Z',
        fill: 'white',
      },
      text: '',
      children: [],
    },
  ],
  x: [
    {
      key: 'x-0',
      tag: 'rect',
      props: {
        x: '1',
        y: '1',
        width: '22',
        height: '22',
        rx: '5',
        fill: '#17191B',
      },
      text: '',
      children: [],
    },
    {
      key: 'x-1',
      tag: 'path',
      props: {
        d: 'M5 4.5h3.2l11 15H16L5 4.5Zm14.2 0L5 19.5',
        stroke: '#fff',
        strokeWidth: '1.65',
        fill: 'none',
      },
      text: '',
      children: [],
    },
  ],
  threads: [
    {
      key: 'threads-0',
      tag: 'circle',
      props: {
        cx: '12',
        cy: '12',
        r: '11',
        fill: '#161616',
      },
      text: '',
      children: [],
    },
    {
      key: 'threads-1',
      tag: 'path',
      props: {
        d: 'M15.9 8.2c-1.5-2.1-5.9-2.4-7.9 0-2.4 2.8-1.7 7.9 1.5 9.4 3.6 1.7 7-.8 7-4.1 0-2.5-3.8-3.7-6.2-2.5-3.9 1.8-2.2 5.4-.7 6.9 1.4',
        stroke: 'white',
        strokeWidth: '1.5',
        fill: 'none',
        strokeLinecap: 'round',
      },
      text: '',
      children: [],
    },
  ],
  shopee: [
    {
      key: 'shopee-0',
      tag: 'path',
      props: {
        d: 'M4 8h16l-1 13H5L4 8Z',
        fill: '#EE4D2D',
      },
      text: '',
      children: [],
    },
    {
      key: 'shopee-1',
      tag: 'path',
      props: {
        d: 'M8.7 9V6a3.3 3.3 0 0 1 6.6 0v3',
        fill: 'none',
        stroke: '#EE4D2D',
        strokeWidth: '1.8',
      },
      text: '',
      children: [],
    },
    {
      key: 'shopee-2',
      tag: 'text',
      props: {
        x: '12',
        y: '18.1',
        fontFamily: 'Arial',
        fontWeight: 'bold',
        fontSize: '10',
        fill: '#fff',
        textAnchor: 'middle',
      },
      text: 'S',
      children: [],
    },
  ],
  zalo: [
    {
      key: 'zalo-0',
      tag: 'rect',
      props: {
        x: '1',
        y: '1',
        width: '22',
        height: '22',
        rx: '5',
        fill: '#0068FF',
      },
      text: '',
      children: [],
    },
    {
      key: 'zalo-1',
      tag: 'text',
      props: {
        x: '12',
        y: '15.8',
        fontFamily: 'Arial',
        fontWeight: '800',
        fontSize: '8.1',
        fill: '#fff',
        textAnchor: 'middle',
      },
      text: 'Zalo',
      children: [],
    },
  ],
};
