﻿import videoCommon = require("./videoplayer-common");
import { ios } from "application"
import { videoSourceProperty } from "./videoplayer-common";
import { subtitleSourceProperty } from "./videoplayer-common";

export * from "./videoplayer-common";

declare const
    NSURL,
    NSDictionary,
    AVPlayer,
    ASBPlayerSubtitling,
    AVPlayerViewController,
    UIView,
    UILabel,
    CMTimeMake;

export class Video extends videoCommon.Video {
    private _player: any; /// AVPlayer
    private _playerController: any; /// AVPlayerViewController
    private _src: string;
    private _subtitling: any; //// ASBPlayerSubtitling
    private _subtitleLabel: any; //// UILabel
    private _subtitleLabelContainer: any; //// UIView
    private _didPlayToEndTimeObserver: any;
    private _didPlayToEndTimeActive: boolean;
    private _observer: NSObject;
    private _observerActive: boolean;
    private _videoLoaded: boolean;
    private _playbackTimeObserver: any;
    private _playbackTimeObserverActive: boolean;
    private _videoPlaying: boolean;
    private _videoFinished: boolean;
    private enableSubtitles: boolean = false;
    public nativeView: any;

    constructor() {
        super();
        this._playerController = new AVPlayerViewController();

        let audioSession = AVAudioSession.sharedInstance();
        let output = audioSession.currentRoute.outputs.lastObject.portType;
        if (output.match(/Receiver/)) {
            try {
              audioSession.setCategoryError(AVAudioSessionCategoryPlayAndRecord);
              audioSession.overrideOutputAudioPortError(AVAudioSessionPortOverride.Speaker);
              audioSession.setActiveError(true);
              //console.log("audioSession category set and active");
            } catch (err) {
              //console.log("setting audioSession category failed");
            }
        }

        this._player = new AVPlayer();
        this._playerController.player = this._player;

        // showsPlaybackControls must be set to false on init to avoid any potential 'Unable to simultaneously satisfy constraints' errors
        this._playerController.showsPlaybackControls = false;
        this.nativeView = this._playerController.view;
        this._observer = PlayerObserverClass.alloc();
        this._observer["_owner"] = this;
        this._videoFinished = false;

        // subtitles setup
        if (this.enableSubtitles) {
            this._subtitling = new ASBPlayerSubtitling();

            this._setupSubtitleLabel();
        }
    }

    get ios(): any {
        return this.nativeView;
    }

    [videoSourceProperty.setNative](value: AVPlayerItem) {
        this._setNativeVideo(value ? (<any>value).ios : null);
    }

    [subtitleSourceProperty.setNative](value: NSString) {
        this._updateSubtitles(value ? (<any>value).ios : null);
    }

    public _setNativeVideo(nativeVideoPlayer: any) {
        //console.log("Set native video: "+nativeVideoPlayer);
        if (nativeVideoPlayer != null) {
            let currentItem = this._player.currentItem;
            this._addStatusObserver(nativeVideoPlayer);
            this._autoplayCheck();
            this._videoFinished = false;
            if (currentItem !== null) {
                this._videoLoaded = false;
                this._videoPlaying = false;
                this._removeStatusObserver(currentItem);
                // Need to set to null so the previous video is not shown while its loading
                this._player.replaceCurrentItemWithPlayerItem(null);
                this._player.replaceCurrentItemWithPlayerItem(nativeVideoPlayer);
            }
            else {
                this._player.replaceCurrentItemWithPlayerItem(nativeVideoPlayer);
                this._init();
            }
        }
    }

    public updateAsset(nativeVideoAsset: AVAsset) {
        let newPlayerItem = AVPlayerItem.playerItemWithAsset(nativeVideoAsset);
        this._setNativeVideo(newPlayerItem);
    }

    public _setNativePlayerSource(nativePlayerSrc: string) {
        this._src = nativePlayerSrc;
        let url: string = NSURL.URLWithString(this._src);
        this._player = new AVPlayer(url);
        //console.log("Video src: "+ this._src);
        this._init();
    }

    private _init() {
        if (this.controls !== false) {
            this._playerController.showsPlaybackControls = true;
        }

        this._playerController.player = this._player;

        if (isNaN(<any>this.width) || isNaN(<any>this.height)) {
            this.requestLayout();
        }

        if (this.muted === true) {
            this._player.muted = true;
        }

        if (!this._didPlayToEndTimeActive) {
            this._didPlayToEndTimeObserver = ios.addNotificationObserver(AVPlayerItemDidPlayToEndTimeNotification, this.AVPlayerItemDidPlayToEndTimeNotification.bind(this));
            this._didPlayToEndTimeActive = true;
        }

        if (this.enableSubtitles) {
            // it's important to set subtitle label first and then player - to let label pick up styles
            this._subtitling.label = this._subtitleLabel;
            this._subtitling.containerView = this._subtitleLabelContainer;
            this._subtitling.player = this._player;
        }
    }

    private _setupSubtitleLabel(){
        let contentOverlayView = this._playerController.contentOverlayView;
        this._subtitleLabel = new UILabel();
        this._subtitleLabelContainer = new UIView();

        contentOverlayView.addSubview(this._subtitleLabelContainer);
        this._subtitleLabelContainer.addSubview(this._subtitleLabel);

        //configure subtitle container - this is required to make insets
        this._subtitleLabelContainer.backgroundColor = UIColor.blackColor;
        this._subtitleLabelContainer.layer.cornerRadius = 2;
        this._subtitleLabelContainer.layer.masksToBounds = true;

        // attach subtitle label to all corners of container
        this._subtitleLabel.translatesAutoresizingMaskIntoConstraints = false;
        this._subtitleLabelContainer.translatesAutoresizingMaskIntoConstraints = false;
        let containerViewsDictionary = new NSDictionary([this._subtitleLabel], ['subtitleLabel']);

        this._subtitleLabelContainer.addConstraints(NSLayoutConstraint.constraintsWithVisualFormatOptionsMetricsViews("H:|-(5)-[subtitleLabel]-(5)-|", NSLayoutFormatOptions.DirectionLeadingToTrailing, null, containerViewsDictionary));
        this._subtitleLabelContainer.addConstraints(NSLayoutConstraint.constraintsWithVisualFormatOptionsMetricsViews("V:|-(0)-[subtitleLabel]-(0)-|", NSLayoutFormatOptions.DirectionLeadingToTrailing , null, containerViewsDictionary));


        this._subtitleLabel.textColor = UIColor.whiteColor;
        this._subtitleLabel.textAlignment = NSTextAlignment.Center;
        this._subtitleLabel.lineBreakMode = NSLineBreakMode.ByWordWrapping;
        this._subtitleLabel.font = UIFont.systemFontOfSizeWeight(15, UIFontWeightRegular);
        this._subtitleLabel.numberOfLines = 0;

        this._subtitleLabel.translatesAutoresizingMaskIntoConstraints = false;

        let viewsDictionary = new NSDictionary([this._subtitleLabelContainer, contentOverlayView], ['subtitleLabelContainer', 'superview']);
        // make 20 point insets from sides
        contentOverlayView.addConstraints(NSLayoutConstraint.constraintsWithVisualFormatOptionsMetricsViews("H:|-(>=20)-[subtitleLabelContainer]-(>=20)-|", 0 , null, viewsDictionary));
        // center text
        contentOverlayView.addConstraints(NSLayoutConstraint.constraintsWithVisualFormatOptionsMetricsViews("V:[superview]-(<=1)-[subtitleLabelContainer]",  NSLayoutFormatOptions.AlignAllCenterX, null, viewsDictionary));
        // add 30 point margin from bottom
        contentOverlayView.addConstraints(NSLayoutConstraint.constraintsWithVisualFormatOptionsMetricsViews("V:[subtitleLabelContainer]-(20)-|", 0, null, viewsDictionary));
    }

    private _updateSubtitles(subtitles: NSString) {
        if (this.enableSubtitles) {
            try {
                this._subtitling.loadSRTContentError(subtitles)
            } catch (e) {
                console.log("Failed to load subtitles: " + e); // NSError:
            }
        }
    }

    private AVPlayerItemDidPlayToEndTimeNotification(notification: any) {
        if (this._player.currentItem && this._player.currentItem === notification.object) {
            // This will match exactly to the object from the notification so can ensure only looping and finished event for the video that has finished.
            // Notification is structured like so: NSConcreteNotification 0x61000024f690 {name = AVPlayerItemDidPlayToEndTimeNotification; object = <AVPlayerItem: 0x600000204190, asset = <AVURLAsset: 0x60000022b7a0, URL = https://clips.vorwaerts-gmbh.de/big_buck_bunny.mp4>>}
            this._emit(videoCommon.Video.finishedEvent);
            this._videoFinished = true;
            if (this.loop === true && this._player !== null) {
                // Go in 5ms for more seamless looping
                this._player.seekToTime(CMTimeMake(5, 100));
                this._player.play();
            }
        }
    }

    public play() {
        if (this._videoFinished) {
            this._videoFinished = false;
            this.seekToTime(CMTimeMake(5, 100));
        }

        if (this.observeCurrentTime && !this._playbackTimeObserverActive) {
            this._addPlaybackTimeObserver();
        }

        this._player.play();
    }

    public pause() {
        this._player.pause();
        if (this._playbackTimeObserverActive) {
            this._removePlaybackTimeObserver();
        }
    }

    public mute(mute: boolean) {
        this._player.muted = mute;
    }

    public seekToTime(ms: number) {
        if (this._player.currentItem && this._player.currentItem.status === AVPlayerItemStatus.ReadyToPlay) {
            let seconds = ms / 1000.0;
            let time = CMTimeMakeWithSeconds(seconds, this._player.currentTime().timescale);
            this._player.seekToTimeToleranceBeforeToleranceAfterCompletionHandler(time, kCMTimeZero, kCMTimeZero, (isFinished) => {
                this._emit(videoCommon.Video.seekToTimeCompleteEvent);
            });
        } else {
            console.log("AVPlayerItem cannot service a seek request with a completion handler until its status is ReadyToPlay.")
        }
    }

    public getDuration(): number {
        let seconds = CMTimeGetSeconds(this._player.currentItem.asset.duration);
        let milliseconds = seconds * 1000.0;
        return milliseconds;
    }

    public getCurrentTime(): any {
        if (this._player === null) {
            return false;
        }
        return (this._player.currentTime().value / this._player.currentTime().timescale) * 1000;
    }

    public setVolume(volume: number) {
        this._player.volume = volume;
    }

    public destroy() {

        this._removeStatusObserver(this._player.currentItem);

        if (this._didPlayToEndTimeActive) {
            ios.removeNotificationObserver(this._didPlayToEndTimeObserver, AVPlayerItemDidPlayToEndTimeNotification);
            this._didPlayToEndTimeActive = false;
        }

        if (this._playbackTimeObserverActive) {
            this._removePlaybackTimeObserver();
        }

        this.pause();
        this._player.replaceCurrentItemWithPlayerItem(null); //de-allocates the AVPlayer
        this._playerController = null;
        this._player = null;
    }

    private _addStatusObserver(currentItem) {
        this._observerActive = true;
        currentItem.addObserverForKeyPathOptionsContext(this._observer, "status", 0, null);
    }

    private _removeStatusObserver(currentItem) {
        // If the observer is active, then we need to remove it...
        if (!this._observerActive) { return; }

        this._observerActive = false;
        if (currentItem) {
            currentItem.removeObserverForKeyPath(this._observer, "status");
        }
    }

    private _addPlaybackTimeObserver() {
        this._playbackTimeObserverActive = true;
        let _interval = CMTimeMake(1, 5);
        this._playbackTimeObserver = this._player.addPeriodicTimeObserverForIntervalQueueUsingBlock(_interval, null, (currentTime) => {
            let _seconds = CMTimeGetSeconds(currentTime);
            let _milliseconds = _seconds * 1000.0;
            this.notify({
                eventName: Video.currentTimeUpdatedEvent,
                object: this,
                position: _milliseconds
            });
        })
    }

    private _removePlaybackTimeObserver() {
        this._playbackTimeObserverActive = false;
        this._player.removeTimeObserver(this._playbackTimeObserver);
    }

    private _autoplayCheck() {
        if (this.autoplay) {
            this.play();
        }
    }

    playbackReady() {
        this._videoLoaded = true;
        this._emit(videoCommon.Video.playbackReadyEvent);
    }

    playbackStart() {
        this._videoPlaying = true;
        this._emit(videoCommon.Video.playbackStartEvent);
    }

}

class PlayerObserverClass extends NSObject {
    observeValueForKeyPathOfObjectChangeContext(path: string, obj: Object, change: NSDictionary<any, any>, context: any) {
        if (path === "status") {
            if (this["_owner"]._player.currentItem.status === AVPlayerItemStatus.ReadyToPlay && !this["_owner"]._videoLoaded) {
                this["_owner"].playbackReady();
            }
        }
    }
}
