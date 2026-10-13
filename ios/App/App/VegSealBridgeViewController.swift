import UIKit
import AVFoundation
import WebKit
import Capacitor

/// The app loads the live VegSeal site inside a web view. Out of the box iOS
/// attributes a camera request to the address being shown, so the prompt reads
/// "vegseal.com would like to use the camera". This subclass intercepts that
/// request and asks for camera access the native way instead, so the prompt is
/// branded: "VegSeal Would Like to Use the Camera", with the wording that comes
/// from NSCameraUsageDescription in Info.plist.
open class VegSealBridgeViewController: CAPBridgeViewController {
    private var cameraDelegate: CameraPermissionUIDelegate?

    open override func capacitorDidLoad() {
        super.capacitorDidLoad()
        guard let web = webView,
              let original = web.uiDelegate,
              cameraDelegate == nil else { return }
        let delegate = CameraPermissionUIDelegate(forwardingTo: original)
        cameraDelegate = delegate
        web.uiDelegate = delegate
    }
}

/// Answers the camera question itself and hands every other web view UI
/// question (alerts, confirm boxes, new windows) back to Capacitor's handler.
final class CameraPermissionUIDelegate: NSObject, WKUIDelegate {
    private let forwarded: WKUIDelegate

    init(forwardingTo forwarded: WKUIDelegate) {
        self.forwarded = forwarded
        super.init()
    }

    override func responds(to aSelector: Selector!) -> Bool {
        if super.responds(to: aSelector) { return true }
        return forwarded.responds(to: aSelector)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        if forwarded.responds(to: aSelector) { return forwarded }
        return super.forwardingTarget(for: aSelector)
    }

    func webView(_ webView: WKWebView,
                 requestMediaCapturePermissionFor origin: WKSecurityOrigin,
                 initiatedByFrame frame: WKFrameInfo,
                 type: WKMediaCaptureType,
                 decisionHandler: @escaping (WKPermissionDecision) -> Void) {
        let mediaType: AVMediaType = type == .microphone ? .audio : .video

        switch AVCaptureDevice.authorizationStatus(for: mediaType) {
        case .authorized:
            decisionHandler(.grant)
        case .notDetermined:
            // Shows the native "VegSeal Would Like to Use the Camera" prompt.
            AVCaptureDevice.requestAccess(for: mediaType) { granted in
                DispatchQueue.main.async {
                    decisionHandler(granted ? .grant : .deny)
                }
            }
        default:
            // Previously denied in Settings — the app shows its own fallback.
            decisionHandler(.deny)
        }
    }
}
