import AVFoundation
import ExpoModulesCore

public class AudioRouteModule: Module {
  private var observer: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("AudioRoute")

    Events("onOutputLost")

    Function("isHeadphonesConnected") { () -> Bool in
      return AudioRouteModule.headphonesConnected()
    }

    OnStartObserving {
      self.observer = NotificationCenter.default.addObserver(
        forName: AVAudioSession.routeChangeNotification,
        object: nil,
        queue: .main
      ) { [weak self] note in
        guard let info = note.userInfo,
          let raw = info[AVAudioSessionRouteChangeReasonKey] as? UInt,
          let reason = AVAudioSession.RouteChangeReason(rawValue: raw),
          reason == .oldDeviceUnavailable
        else {
          return
        }
        self?.sendEvent("onOutputLost", ["headphones": AudioRouteModule.headphonesConnected()])
      }
    }

    OnStopObserving {
      if let observer = self.observer {
        NotificationCenter.default.removeObserver(observer)
        self.observer = nil
      }
    }
  }

  static func headphonesConnected() -> Bool {
    let personal: [AVAudioSession.Port] = [
      .headphones, .bluetoothA2DP, .bluetoothHFP, .bluetoothLE, .usbAudio, .airPlay, .carAudio,
    ]
    return AVAudioSession.sharedInstance().currentRoute.outputs.contains { personal.contains($0.portType) }
  }
}
