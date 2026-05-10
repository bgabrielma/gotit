import SwiftUI

public struct InputBar: View {
    @Binding var text: String
    let onSend: () -> Void
    let onAttach: () -> Void
    let onLookAgain: () -> Void
    let onSave: () -> Void
    let onReset: () -> Void
    let isBusy: Bool

    public init(text: Binding<String>, onSend: @escaping () -> Void, onAttach: @escaping () -> Void,
                onLookAgain: @escaping () -> Void, onSave: @escaping () -> Void, onReset: @escaping () -> Void, isBusy: Bool) {
        self._text = text; self.onSend = onSend; self.onAttach = onAttach; self.onLookAgain = onLookAgain
        self.onSave = onSave; self.onReset = onReset; self.isBusy = isBusy
    }

    public var body: some View {
        HStack(spacing: 8) {
            TextField("Ask anything…", text: $text)
                .textFieldStyle(.roundedBorder)
                .onSubmit(onSend)
                .disabled(isBusy)
            Button(action: onAttach) { Image(systemName: "paperclip") }.disabled(isBusy)
            Divider().frame(height: 18)
            Button("Look again", action: onLookAgain).disabled(isBusy)
            Button("Save", action: onSave).disabled(isBusy)
            Button("Reset", action: onReset).disabled(isBusy)
        }
        .padding(8)
    }
}
