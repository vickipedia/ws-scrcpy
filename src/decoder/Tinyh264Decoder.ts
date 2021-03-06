// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import Worker from '../tinyh264/H264NALDecoder.worker';
import VideoSettings from '../VideoSettings';
import YUVWebGLCanvas from '../tinyh264/YUVWebGLCanvas';
import YUVCanvas from '../tinyh264/YUVCanvas';
import CanvasCommon from './CanvasCommon';

type WorkerMessage = {
    type: string;
    width: number;
    height: number;
    data: ArrayBuffer;
    renderStateId: number;
};

export default class Tinyh264Decoder extends CanvasCommon {
    private static videoStreamId = 1;
    public static readonly preferredVideoSettings: VideoSettings = new VideoSettings({
        lockedVideoOrientation: -1,
        bitrate: 500000,
        frameRate: 24,
        iFrameInterval: 5,
        maxSize: 480,
        sendFrameMeta: false,
    });

    private worker?: Worker;
    private isDecoderReady = false;
    protected canvas?: YUVWebGLCanvas | YUVCanvas;
    public readonly supportsScreenshot: boolean = true;

    constructor(udid: string) {
        super(udid, 'Tinyh264Decoder');
    }

    private onWorkerMessage = (e: MessageEvent): void => {
        const message: WorkerMessage = e.data;
        switch (message.type) {
            case 'pictureReady':
                const { width, height, data } = message;
                if (this.canvas) {
                    this.canvas.decode(new Uint8Array(data), width, height);
                }
                break;
            case 'decoderReady':
                this.isDecoderReady = true;
                break;
            default:
                console.error(this.name, Error(`Wrong message type "${message.type}"`));
        }
    };

    private initWorker(): void {
        this.worker = new Worker();
        this.worker.addEventListener('message', this.onWorkerMessage);
    }

    protected initCanvas(width: number, height: number): void {
        super.initCanvas(width, height);

        if (CanvasCommon.hasWebGLSupport()) {
            this.canvas = new YUVWebGLCanvas(this.tag);
        } else {
            this.canvas = new YUVCanvas(this.tag);
        }
    }

    protected decode(data: Uint8Array): void {
        if (!this.worker || !this.isDecoderReady) {
            return;
        }

        this.worker.postMessage(
            {
                type: 'decode',
                data: data.buffer,
                offset: data.byteOffset,
                length: data.byteLength,
                renderStateId: Tinyh264Decoder.videoStreamId,
            },
            [data.buffer],
        );
    }

    public play(): void {
        super.play();
        if (!this.worker) {
            this.initWorker();
        }
    }

    public stop(): void {
        super.stop();
        if (this.worker) {
            this.worker.worker.removeEventListener('message', this.onWorkerMessage);
            this.worker.postMessage({ type: 'release', renderStateId: Tinyh264Decoder.videoStreamId });
            delete this.worker;
        }
    }

    public getPreferredVideoSetting(): VideoSettings {
        return Tinyh264Decoder.preferredVideoSettings;
    }

    protected clearState(): void {
        super.clearState();
        if (this.worker) {
            this.worker.postMessage({ type: 'release', renderStateId: Tinyh264Decoder.videoStreamId });
            Tinyh264Decoder.videoStreamId++;
        }
    }
}
